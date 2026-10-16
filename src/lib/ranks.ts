// The rank engine. Ranks are earned, never bought, and the public promises
// are exact: Fledgling = joined + 1 published flight; Rider = 20 published
// flights + 2 vouches from Riders. Wingleader needs "runs a wing", and Wings
// are deferred — so computeRank caps at Rider and Wingleader is an admin
// grant only. Everything here reads the published_logs mirror and the
// vouches table; git stays canonical for the flights themselves.

export type Rank = 'fledgling' | 'rider' | 'wingleader';

export const RANK_ORDER: Record<string, number> = {
  '': 0,
  fledgling: 1,
  rider: 2,
  wingleader: 3,
};

export const RIDER_FLIGHT_GATE = 20;
export const RIDER_VOUCH_GATE = 2;

export type RankStats = {
  publishedFlights: number;
  /** Active vouches from a non-banned voucher who currently holds ≥ Rider. */
  qualifyingVouches: number;
};

/**
 * The automatic rank from the record. Returns null (unranked) below the
 * Fledgling bar. Never returns 'wingleader' — that rank is reached only by
 * an admin grant, because its published requirement ("runs a wing") can't
 * be met while Wings are deferred.
 */
export function computeRank(stats: RankStats): Rank | null {
  if (stats.publishedFlights >= RIDER_FLIGHT_GATE && stats.qualifyingVouches >= RIDER_VOUCH_GATE) {
    return 'rider';
  }
  if (stats.publishedFlights >= 1) return 'fledgling';
  return null;
}

function order(rank: string | null): number {
  return RANK_ORDER[rank ?? ''] ?? 0;
}

export async function loadRankStats(db: D1Database, riderId: string): Promise<RankStats> {
  const flights = await db
    .prepare('SELECT COUNT(*) AS n FROM published_logs WHERE rider_id = ?')
    .bind(riderId)
    .first<{ n: number }>();
  const vouches = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM vouches v
       JOIN riders voucher ON voucher.id = v.voucher_id
       WHERE v.vouchee_id = ? AND v.status = 'active'
         AND voucher.banned_at IS NULL
         AND voucher.rank IN ('rider','wingleader')`,
    )
    .bind(riderId)
    .first<{ n: number }>();
  return {
    publishedFlights: flights?.n ?? 0,
    qualifyingVouches: vouches?.n ?? 0,
  };
}

/**
 * Recompute and persist a rider's rank, writing a rank_events row only when
 * it changes. Promotions always apply. Demotions apply only when allowed
 * (moderation/ban) — voluntary vouch revocation must never demote. An
 * admin-granted Wingleader is left in place unless a demotion is allowed,
 * since computeRank can't re-derive it.
 */
export async function recomputeRank(
  db: D1Database,
  riderId: string,
  actor: string,
  reason: string,
  opts: { allowDemotion?: boolean } = {},
): Promise<{ changed: boolean; from: string | null; to: string | null }> {
  const rider = await db
    .prepare('SELECT rank, banned_at FROM riders WHERE id = ?')
    .bind(riderId)
    .first<{ rank: string | null; banned_at: string | null }>();
  if (!rider) return { changed: false, from: null, to: null };

  const current = rider.rank;
  const computed = computeRank(await loadRankStats(db, riderId));

  // Keep an admin-granted Wingleader unless we're explicitly allowed to demote.
  let target: string | null;
  if (current === 'wingleader' && !opts.allowDemotion) {
    target = current;
  } else if (opts.allowDemotion) {
    target = computed; // moderation/ban: the computed rank wins, down included
  } else {
    // Normal path: rank only moves up automatically.
    target = order(computed) > order(current) ? computed : current;
  }

  if (target === current) return { changed: false, from: current, to: current };

  const now = new Date().toISOString();
  await db.batch([
    db.prepare('UPDATE riders SET rank = ? WHERE id = ?').bind(target, riderId),
    db
      .prepare(
        `INSERT INTO rank_events (id, rider_id, old_rank, new_rank, reason, actor, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), riderId, current, target, reason, actor, now),
  ]);
  return { changed: true, from: current, to: target };
}

/** When did this rider reach their current rank? (for "earned" on the profile) */
export async function rankEarnedAt(
  db: D1Database,
  riderId: string,
  rank: string,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT created_at FROM rank_events WHERE rider_id = ? AND new_rank = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(riderId, rank)
    .first<{ created_at: string }>();
  return row?.created_at ?? null;
}
