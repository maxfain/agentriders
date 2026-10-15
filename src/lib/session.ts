// Sessions: the cookie holds a raw random token; D1 stores only
// SHA-256(token + pepper) as the row id, so a leaked database cannot be
// replayed as cookies. A fresh token is issued on every login.

import { randomToken, sha256Hex } from './crypto';

export const SESSION_COOKIE = 'ar_session';
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const LAST_SEEN_THROTTLE_MS = 60 * 60 * 1000; // touch last_seen_at hourly

export type RiderRow = {
  id: string;
  handle: string;
  display_name: string;
  bio: string | null;
  rank: 'fledgling' | 'rider' | 'wingleader' | null;
  is_admin: number;
  banned_at: string | null;
  created_at: string;
};

async function sessionIdFor(token: string, pepper: string): Promise<string> {
  return sha256Hex(`${token}${pepper}`);
}

export async function createSession(
  db: D1Database,
  pepper: string,
  riderId: string,
): Promise<{ token: string; expiresAt: string }> {
  const token = randomToken(32);
  const id = await sessionIdFor(token, pepper);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();
  await db
    .prepare('INSERT INTO sessions (id, rider_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(id, riderId, now.toISOString(), expiresAt)
    .run();
  return { token, expiresAt };
}

/**
 * Token → rider, or null for a missing, expired, or banned-rider session.
 * Expired rows are deleted on sight; last_seen_at is touched at most
 * hourly to keep reads cheap.
 */
export async function resolveSession(
  db: D1Database,
  pepper: string,
  token: string,
): Promise<{ sessionId: string; rider: RiderRow } | null> {
  if (!token) return null;
  const id = await sessionIdFor(token, pepper);
  const row = await db
    .prepare(
      `SELECT s.id AS session_id, s.expires_at, s.last_seen_at,
              r.id, r.handle, r.display_name, r.bio, r.rank, r.is_admin, r.banned_at, r.created_at
       FROM sessions s JOIN riders r ON r.id = s.rider_id
       WHERE s.id = ?`,
    )
    .bind(id)
    .first<RiderRow & { session_id: string; expires_at: string; last_seen_at: string | null }>();
  if (!row) return null;

  const now = new Date();
  if (new Date(row.expires_at) <= now) {
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
    return null;
  }
  if (row.banned_at) return null;

  const lastSeen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
  if (now.getTime() - lastSeen > LAST_SEEN_THROTTLE_MS) {
    await db
      .prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?')
      .bind(now.toISOString(), id)
      .run();
  }

  return {
    sessionId: row.session_id,
    rider: {
      id: row.id,
      handle: row.handle,
      display_name: row.display_name,
      bio: row.bio,
      rank: row.rank,
      is_admin: row.is_admin,
      banned_at: row.banned_at,
      created_at: row.created_at,
    },
  };
}

export async function destroySession(db: D1Database, pepper: string, token: string): Promise<void> {
  if (!token) return;
  const id = await sessionIdFor(token, pepper);
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
}
