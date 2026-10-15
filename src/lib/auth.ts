// Shared sign-in completion for both providers: find-or-create the rider
// behind an identity, open a session, set the cookie. New riders get a
// generated "pending-…" handle and claim their real one at /join.

import type { APIContext } from 'astro';
import { PENDING_HANDLE_PREFIX, isPendingHandle } from './handles';
import { createSession, SESSION_COOKIE, SESSION_TTL_SECONDS, type RiderRow } from './session';

export type Provider = 'github' | 'email';

export async function findOrCreateRider(
  db: D1Database,
  provider: Provider,
  providerId: string,
  opts: { email?: string | null; displayName?: string | null },
): Promise<RiderRow> {
  const existing = await db
    .prepare(
      `SELECT r.id, r.handle, r.display_name, r.bio, r.rank, r.is_admin, r.banned_at, r.created_at
       FROM identities i JOIN riders r ON r.id = i.rider_id
       WHERE i.provider = ? AND i.provider_id = ?`,
    )
    .bind(provider, providerId)
    .first<RiderRow>();
  if (existing) return existing;

  const riderId = crypto.randomUUID();
  const now = new Date().toISOString();
  const handle = `${PENDING_HANDLE_PREFIX}${riderId.replaceAll('-', '').slice(0, 12)}`;
  const displayName =
    opts.displayName?.trim() || opts.email?.split('@')[0]?.trim() || 'New rider';
  const rider: RiderRow = {
    id: riderId,
    handle,
    display_name: displayName.slice(0, 60),
    bio: null,
    rank: null,
    is_admin: 0,
    banned_at: null,
    created_at: now,
  };
  await db.batch([
    db
      .prepare(
        'INSERT INTO riders (id, handle, display_name, rank, is_admin, created_at) VALUES (?, ?, ?, NULL, 0, ?)',
      )
      .bind(rider.id, rider.handle, rider.display_name, now),
    db
      .prepare(
        'INSERT INTO identities (id, rider_id, provider, provider_id, email, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(crypto.randomUUID(), rider.id, provider, providerId, opts.email ?? null, now),
  ]);
  return rider;
}

/**
 * Opens a session for the rider and sets the cookie on the response.
 * Returns the post-login path: /join while the handle is unclaimed,
 * /me once it is. Banned riders get no session.
 */
export async function completeSignIn(
  context: APIContext,
  db: D1Database,
  pepper: string,
  rider: RiderRow,
): Promise<string> {
  if (rider.banned_at) return '/join?error=banned';
  const { token } = await createSession(db, pepper, rider.id);
  const secure = context.url.protocol === 'https:';
  context.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  // Non-sensitive hint for the static header: "worth asking /api/me".
  context.cookies.set('ar_signedin', '1', {
    httpOnly: false,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return isPendingHandle(rider.handle) ? '/join' : '/me';
}
