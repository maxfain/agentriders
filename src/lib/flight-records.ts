// Flight records: stored, signed, metadata-only proofs that a rider's own
// registered device produced a Claude Code session. A record can be *matched*
// to one of the rider's published logs, which lights the "Verified flight"
// badge. Matching is deliberately separate from the signature: the signed
// payload is pure session facts; which published log it vouches for is an
// association the rider makes (and can relink).

export type FlightRecordRow = {
  id: string;
  rider_id: string;
  device_id: string;
  cc_session_hash: string | null;
  evals_score: number | null;
  matched_log_slug: string | null;
  payload_json: string;
  created_at: string;
};

export type MatchResult = { ok: true } | { ok: false; status: number; reason: string };

/**
 * Link a record to a published log. Both must belong to the rider; the log
 * must not already carry a verified record, and the record must be free. The
 * partial UNIQUE index on matched_log_slug is the race backstop.
 */
export async function matchRecordToLog(
  db: D1Database,
  riderId: string,
  recordId: string,
  slug: string,
): Promise<MatchResult> {
  const record = await db
    .prepare('SELECT id, matched_log_slug FROM flight_records WHERE id = ? AND rider_id = ?')
    .bind(recordId, riderId)
    .first<{ id: string; matched_log_slug: string | null }>();
  if (!record) return { ok: false, status: 404, reason: 'No such record.' };
  if (record.matched_log_slug === slug) return { ok: true }; // idempotent
  if (record.matched_log_slug)
    return { ok: false, status: 409, reason: 'Unlink this record from its flight first.' };

  const log = await db
    .prepare('SELECT slug, rider_id FROM published_logs WHERE slug = ?')
    .bind(slug)
    .first<{ slug: string; rider_id: string | null }>();
  if (!log) return { ok: false, status: 404, reason: 'No such published flight.' };
  if (log.rider_id !== riderId) return { ok: false, status: 403, reason: "That flight isn't yours." };

  try {
    const res = await db
      .prepare(
        'UPDATE flight_records SET matched_log_slug = ? WHERE id = ? AND rider_id = ? AND matched_log_slug IS NULL',
      )
      .bind(slug, recordId, riderId)
      .run();
    if (res.meta.changes !== 1) return { ok: false, status: 409, reason: 'Could not link this record.' };
  } catch (error) {
    if (`${(error as Error).message}`.includes('UNIQUE'))
      return { ok: false, status: 409, reason: 'That flight already has a verified record.' };
    throw error;
  }
  return { ok: true };
}

export async function unmatchRecord(db: D1Database, riderId: string, recordId: string): Promise<boolean> {
  const res = await db
    .prepare('UPDATE flight_records SET matched_log_slug = NULL WHERE id = ? AND rider_id = ?')
    .bind(recordId, riderId)
    .run();
  return res.meta.changes === 1;
}

export async function deleteRecord(db: D1Database, riderId: string, recordId: string): Promise<boolean> {
  const res = await db
    .prepare('DELETE FROM flight_records WHERE id = ? AND rider_id = ?')
    .bind(recordId, riderId)
    .run();
  return res.meta.changes === 1;
}

export async function listRecords(db: D1Database, riderId: string): Promise<FlightRecordRow[]> {
  return (
    (
      await db
        .prepare(
          `SELECT id, rider_id, device_id, cc_session_hash, evals_score, matched_log_slug, payload_json, created_at
           FROM flight_records WHERE rider_id = ? ORDER BY created_at DESC`,
        )
        .bind(riderId)
        .all<FlightRecordRow>()
    ).results ?? []
  );
}

export type RiderEvalStats = {
  verified: number;
  bestScore: number;
  frameworks: string[];
  evalRuns: number;
};

/**
 * Aggregate the display-only eval stats for a profile from the rider's
 * records: how many are verified (matched to a log), the best eval score, the
 * distinct frameworks seen, and total eval runs. Never affects rank.
 */
export async function riderEvalStats(db: D1Database, riderId: string): Promise<RiderEvalStats> {
  const rows = (
    await db
      .prepare('SELECT evals_score, matched_log_slug, payload_json FROM flight_records WHERE rider_id = ?')
      .bind(riderId)
      .all<{ evals_score: number | null; matched_log_slug: string | null; payload_json: string }>()
  ).results ?? [];

  let verified = 0;
  let bestScore = 0;
  let evalRuns = 0;
  const frameworks = new Set<string>();
  for (const r of rows) {
    if (r.matched_log_slug) verified += 1;
    if (typeof r.evals_score === 'number') bestScore = Math.max(bestScore, r.evals_score);
    try {
      const p = JSON.parse(r.payload_json) as {
        evals?: { eval_frameworks_detected?: string[]; eval_run_count?: number };
      };
      for (const f of p.evals?.eval_frameworks_detected ?? []) frameworks.add(f);
      if (typeof p.evals?.eval_run_count === 'number') evalRuns += p.evals.eval_run_count;
    } catch {
      /* a malformed stored payload never breaks a profile render */
    }
  }
  return { verified, bestScore, frameworks: [...frameworks].sort(), evalRuns };
}
