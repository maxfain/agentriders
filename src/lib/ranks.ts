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

const VOUCH_RANKS = new Set(['rider', 'wingleader']);
const CASCADE_CAP = 2000; // runaway guard; real vouch graphs are tiny

/**
 * Recompute and persist one rider's rank, writing a rank_events row only when
 * it changes. Promotions always apply; demotions only when allowed
 * (moderation/ban) — voluntary vouch revocation must never demote. Wingleader
 * is NEVER touched here: computeRank can't re-derive it (Wings are deferred),
 * so only an explicit admin grant removes it, even under allowDemotion.
 * The write is guarded on the rank we read, so a concurrent demotion can't be
 * silently overwritten by a stale promotion.
 */
export async function recomputeRank(
  db: D1Database,
  riderId: string,
  actor: string,
  reason: string,
  opts: { allowDemotion?: boolean } = {},
): Promise<{ changed: boolean; from: string | null; to: string | null }> {
  const rider = await db
    .prepare('SELECT rank FROM riders WHERE id = ?')
    .bind(riderId)
    .first<{ rank: string | null }>();
  if (!rider) return { changed: false, from: null, to: null };

  const current = rider.rank;
  // Wingleader is admin-only — never auto-changed, up or down.
  if (current === 'wingleader') return { changed: false, from: current, to: current };

  const computed = computeRank(await loadRankStats(db, riderId));
  const target = opts.allowDemotion
    ? computed
    : order(computed) > order(current) ? computed : current;
  if (target === current) return { changed: false, from: current, to: current };

  const now = new Date().toISOString();
  // Conditional write: only if the rank is still what we read (null-safe IS).
  const upd = await db
    .prepare('UPDATE riders SET rank = ? WHERE id = ? AND rank IS ?')
    .bind(target, riderId, current)
    .run();
  if (upd.meta.changes !== 1) {
    // Lost a race with another recompute; a later trigger reconciles.
    return { changed: false, from: current, to: current };
  }
  await db
    .prepare(
      `INSERT INTO rank_events (id, rider_id, old_rank, new_rank, reason, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), riderId, current, target, reason, actor, now)
    .run();
  return { changed: true, from: current, to: target };
}

/**
 * Transitive recompute across the vouch graph. When a rider crosses the
 * vouch-qualifying boundary (Rider), the people they vouched for may cross
 * too — so a single ban or removal has to ripple through the whole ring, not
 * just the first hop. BFS with a visited set; bounded by CASCADE_CAP.
 *
 * allowDemotion=true (ban / moderation): follow riders who STOP qualifying.
 * allowDemotion=false (unban / publish / vouch): follow riders who START
 * qualifying, promotion-only.
 */
export async function cascadeRank(
  db: D1Database,
  seedRiderIds: string[],
  actor: string,
  reason: string,
  opts: { allowDemotion?: boolean } = {},
): Promise<void> {
  const allowDemotion = !!opts.allowDemotion;
  const queue = [...new Set(seedRiderIds)];
  const visited = new Set<string>();
  let guard = 0;
  while (queue.length && guard < CASCADE_CAP) {
    guard += 1;
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const res = await recomputeRank(db, id, actor, reason, { allowDemotion });
    if (!res.changed) continue;

    const wasVoucher = VOUCH_RANKS.has(res.from ?? '');
    const nowVoucher = VOUCH_RANKS.has(res.to ?? '');
    // Only a crossing of the Rider boundary changes whether this rider's
    // outbound vouches count toward their vouchees' ranks.
    const crossed = allowDemotion ? wasVoucher && !nowVoucher : !wasVoucher && nowVoucher;
    if (!crossed) continue;

    const vouchees = await db
      .prepare("SELECT DISTINCT vouchee_id FROM vouches WHERE voucher_id = ? AND status = 'active'")
      .bind(id)
      .all<{ vouchee_id: string }>();
    for (const v of vouchees.results ?? []) {
      if (!visited.has(v.vouchee_id)) queue.push(v.vouchee_id);
    }
  }
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
