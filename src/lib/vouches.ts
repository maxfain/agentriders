// Vouching: a Rider puts their name on another rider's record with a public
// statement. Anti-gaming is the whole point — every vouch is named and
// public, a voucher must already hold ≥ Rider, no self-vouch, one per pair.
// The rank engine only counts vouches from non-banned voucher ≥ Rider, so a
// vouch ring self-heals the moment a fraudulent voucher is banned.

export const MAX_VOUCHES_PER_DAY = 5;
export const STATEMENT_MAX = 500;
export const VOUCH_RANKS = new Set(['rider', 'wingleader']);

export type VouchRow = {
  id: string;
  voucher_id: string;
  vouchee_id: string;
  statement: string;
  status: string;
  created_at: string;
};

/** A rider may give a vouch only once they hold Rider or above. */
export function canVouch(rank: string | null): boolean {
  return !!rank && VOUCH_RANKS.has(rank);
}

export function validateStatement(raw: string): { ok: true; statement: string } | { ok: false; reason: string } {
  const statement = raw.trim();
  if (!statement) return { ok: false, reason: 'A vouch needs a statement — say what you saw.' };
  if (statement.length > STATEMENT_MAX) {
    return { ok: false, reason: `Keep the statement under ${STATEMENT_MAX} characters.` };
  }
  return { ok: true, statement };
}

export type ProfileVouch = {
  id: string;
  statement: string;
  created_at: string;
  handle: string;
  display_name: string;
  rank: string | null;
};

/** Active vouches written ABOUT this rider (received), newest first. */
export async function vouchesReceived(db: D1Database, voucheeId: string): Promise<ProfileVouch[]> {
  const rows = await db
    .prepare(
      `SELECT v.id, v.statement, v.created_at, r.handle, r.display_name, r.rank
       FROM vouches v JOIN riders r ON r.id = v.voucher_id
       WHERE v.vouchee_id = ? AND v.status = 'active' AND r.banned_at IS NULL
       ORDER BY v.created_at DESC`,
    )
    .bind(voucheeId)
    .all<ProfileVouch>();
  return rows.results ?? [];
}

/** Active vouches this rider has GIVEN, newest first. */
export async function vouchesGiven(db: D1Database, voucherId: string): Promise<ProfileVouch[]> {
  const rows = await db
    .prepare(
      `SELECT v.id, v.statement, v.created_at, r.handle, r.display_name, r.rank
       FROM vouches v JOIN riders r ON r.id = v.vouchee_id
       WHERE v.voucher_id = ? AND v.status = 'active' AND r.banned_at IS NULL
       ORDER BY v.created_at DESC`,
    )
    .bind(voucherId)
    .all<ProfileVouch>();
  return rows.results ?? [];
}

/** The active vouch from voucher → vouchee, if any (for the "you vouched" UI). */
export async function existingVouch(
  db: D1Database,
  voucherId: string,
  voucheeId: string,
): Promise<VouchRow | null> {
  return db
    .prepare('SELECT * FROM vouches WHERE voucher_id = ? AND vouchee_id = ?')
    .bind(voucherId, voucheeId)
    .first<VouchRow>();
}
