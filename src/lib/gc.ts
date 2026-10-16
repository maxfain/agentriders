// Garbage collection for short-lived rows. Cloudflare Pages has no cron, so
// we sweep opportunistically on the (low-traffic, authenticated) admin render
// and expose an admin endpoint for an explicit run. Each sweep is bounded by a
// LIMIT so a large backlog is cleared over several passes rather than one
// unbounded delete.
//
// Expired sessions are already deleted on access by resolveSession; this
// catches the abandoned ones, plus consumed/expired magic-link tokens and
// device link codes that are never revisited.

export type GcResult = { sessions: number; magicTokens: number; deviceCodes: number };

export async function sweepExpired(
  db: D1Database,
  opts: { now?: string; limit?: number } = {},
): Promise<GcResult> {
  const now = opts.now ?? new Date().toISOString();
  const limit = Math.max(1, Math.min(opts.limit ?? 500, 5000));

  const sessions =
    (
      await db
        .prepare('DELETE FROM sessions WHERE id IN (SELECT id FROM sessions WHERE expires_at <= ? LIMIT ?)')
        .bind(now, limit)
        .run()
    ).meta.changes ?? 0;

  const magicTokens =
    (
      await db
        .prepare(
          `DELETE FROM magic_link_tokens WHERE token_hash IN (
             SELECT token_hash FROM magic_link_tokens
             WHERE expires_at <= ? OR consumed_at IS NOT NULL LIMIT ?)`,
        )
        .bind(now, limit)
        .run()
    ).meta.changes ?? 0;

  const deviceCodes =
    (
      await db
        .prepare(
          `DELETE FROM device_link_codes WHERE code_hash IN (
             SELECT code_hash FROM device_link_codes
             WHERE expires_at <= ? OR consumed_at IS NOT NULL LIMIT ?)`,
        )
        .bind(now, limit)
        .run()
    ).meta.changes ?? 0;

  return { sessions, magicTokens, deviceCodes };
}
