import type { APIRoute } from 'astro';
import { isPendingHandle } from '../../../lib/handles';
import { rateLimit } from '../../../lib/ratelimit';
import { readProfileExtras, validateProfileInput } from '../../../lib/profile';
import { mountBySlug, mountCounts } from '../../../lib/mounts';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// The riders columns a profile save may touch, keyed by patch key. The only
// place a column name is spelled; values are always bound. display_name and
// bio exist on migration 0001, github_public only from 0002 — and it reaches
// the patch only when a GitHub login was read, which a 0001 database never
// yields, so a name-and-bio save works either side of the migration.
const RIDER_COLUMNS = { display_name: 'display_name', bio: 'bio', github_public: 'github_public' } as const;
const STORAGE_UPGRADING = 'Profile storage is being upgraded. Try again shortly.';

// Save the rider-typed half of a profile: display name, one-line bio, the
// mounts they declare (rides), and whether the GitHub login shows. Cookie-only
// by construction — the route is not in the middleware's device-auth allowlist,
// and sessionId is required here as well — so a device key can never rewrite a
// profile. Everything is one batch: rides are replaced whole (DELETE + INSERT
// in the rider's order), and on a database still on 0001 the batch fails as a
// unit and the rider gets the upgrade message instead of a half-written save.
export const PUT: APIRoute = async ({ locals, request }) => {
  const rider = locals.rider;
  if (!rider || !locals.sessionId) return json(401, { error: 'Sign in first.' });
  if (isPendingHandle(rider.handle)) return json(403, { error: 'Claim your handle first.' });

  const { env } = locals.runtime;
  if (!(await rateLimit(env.RATE, `profile:${rider.id}`, 30, 3600))) {
    return json(429, { error: 'Too many saves. Try again in an hour.' });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Send JSON.' });
  }

  // githubPublic is only meaningful with a login to show; validation drops it
  // otherwise, so the column is never written for a rider who signed in by email.
  // The counts (published flights only) are the record tier the validator
  // accepts beside the catalogue — what the picker offers, the save takes —
  // and they set each ride's `public` flag in the response below.
  const [extras, counts] = await Promise.all([readProfileExtras(env.DB, rider.id), mountCounts(env.DB)]);
  const hasGithubLogin = !!extras.github_login;
  const validation = validateProfileInput(body, { hasGithubLogin, record: counts });
  if (!validation.ok) return json(400, { error: validation.error });
  const { patch } = validation;

  const statements: D1PreparedStatement[] = [];
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  for (const key of ['display_name', 'bio', 'github_public'] as const) {
    if (!Object.hasOwn(patch, key)) continue;
    sets.push(`${RIDER_COLUMNS[key]} = ?`);
    values.push(patch[key] ?? null);
  }
  if (sets.length) {
    statements.push(env.DB.prepare(`UPDATE riders SET ${sets.join(', ')} WHERE id = ?`).bind(...values, rider.id));
  }
  // Rides are replaced whole — unless there is nothing to replace and nothing
  // to write, which is a no-op rather than a DELETE: on a database still on
  // 0001 (where extras.rides is the catch default, []) a save with no chips
  // pressed then goes through instead of failing the batch.
  if (patch.mounts && (patch.mounts.length > 0 || extras.rides.length > 0)) {
    const now = new Date().toISOString();
    statements.push(env.DB.prepare('DELETE FROM rider_mounts WHERE rider_id = ?').bind(rider.id));
    patch.mounts.forEach((m, position) => {
      statements.push(
        env.DB.prepare(
          'INSERT INTO rider_mounts (rider_id, mount_slug, mount, position, created_at) VALUES (?, ?, ?, ?, ?)',
        ).bind(rider.id, m.slug, m.name, position, now),
      );
    });
  }

  // An empty patch (a body of unknown keys only) is a no-op save: nothing to
  // write, the current values come back.
  if (statements.length) {
    try {
      await env.DB.batch(statements);
    } catch {
      return json(500, { error: STORAGE_UPGRADING });
    }
  }

  // `public` says whether a ride renders on /riders/<handle>/: only when the
  // slug is catalogued or a published flight already names it (mergeMounts'
  // rule), so the editor can tell the rider which rides stay private for now.
  const rides = patch.mounts ?? extras.rides;
  return json(200, {
    ok: true,
    displayName: patch.display_name ?? rider.display_name,
    bio: patch.bio === undefined ? rider.bio : patch.bio,
    mounts: rides.map((m) => ({ slug: m.slug, name: m.name, public: !!mountBySlug(m.slug) || counts.has(m.slug) })),
    githubPublic: hasGithubLogin ? (patch.github_public ?? extras.github_public) === 1 : null,
  });
};
