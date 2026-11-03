// Claim a corpus flight (docs/flight-log-corpus.md). Ownership is proven by
// GitHub sign-in alone: the session rider's GitHub identity must equal the
// flight author's github_user_id — checked again inside the claim_flight RPC.
// POST {owner, repo, number} claims one; POST {all: true} claims every
// unclaimed flight by the same account ("We found N more flights of yours").

import type { APIRoute } from 'astro';
import { rateLimit } from '../../../lib/ratelimit';
import { recomputeRank } from '../../../lib/ranks';
import {
  flightlogConfigured, githubIdentityOf, rpc, validOwner, validRepoName,
} from '../../../lib/flightlog';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Resync the rider's claimed-flight mirror in D1 and recompute their rank. */
async function syncClaimsAndRank(
  env: App.Locals['runtime']['env'],
  riderId: string,
): Promise<number> {
  const mine = await rpc<{ total: number }>(env, 'rider_flights', { p_rider_id: riderId });
  const claimed = Number(mine?.total ?? 0);
  try {
    await env.DB.prepare(
      `INSERT INTO rider_claimed_flights (rider_id, claimed, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (rider_id) DO UPDATE SET claimed = excluded.claimed, updated_at = excluded.updated_at`,
    ).bind(riderId, claimed, new Date().toISOString()).run();
    await recomputeRank(env.DB, riderId, 'system', 'flight_claimed');
  } catch {
    // Pre-0003 database: the claim itself stands; ranks catch up after the
    // migration via /api/cron/flightlog.
  }
  return claimed;
}

export const POST: APIRoute = async ({ locals, request }) => {
  const rider = locals.rider;
  if (!rider) return json(401, { error: 'Sign in first.' });
  const { env } = locals.runtime;
  if (!flightlogConfigured(env)) return json(503, { error: 'The flight log is not configured yet.' });
  if (!(await rateLimit(env.RATE, `flclaim:${rider.id}`, 30, 3600))) {
    return json(429, { error: 'Too many attempts. Try again in an hour.' });
  }

  const githubId = await githubIdentityOf(env.DB, rider.id);
  if (githubId === null) {
    return json(403, { error: 'Claiming needs a GitHub sign-in — your account has no GitHub identity.' });
  }

  let body: { owner?: string; repo?: string; number?: number; all?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json(400, { error: 'Send JSON: { "owner": "...", "repo": "...", "number": 123 } or { "all": true }' });
  }

  if (body.all === true) {
    const result = await rpc<{ ok: boolean; claimed: number }>(env, 'claim_all', {
      p_rider_id: rider.id,
      p_rider_handle: rider.handle,
      p_github_user_id: githubId,
    });
    const claimedTotal = await syncClaimsAndRank(env, rider.id);
    return json(200, { ok: true, claimed: result?.claimed ?? 0, total: claimedTotal });
  }

  const owner = (body.owner ?? '').trim();
  const repo = (body.repo ?? '').trim();
  const number = Number(body.number);
  if (!validOwner(owner) || !validRepoName(repo) || !Number.isInteger(number) || number < 1) {
    return json(400, { error: 'That does not name a flight.' });
  }
  const flight = await rpc<{ flight: { id: number } }>(env, 'flight_page', {
    p_owner: owner, p_repo: repo, p_number: number,
  });
  if (!flight?.flight?.id) return json(404, { error: 'No such flight.' });

  const result = await rpc<{ ok: boolean; error?: string; already?: boolean }>(env, 'claim_flight', {
    p_flight_id: flight.flight.id,
    p_rider_id: rider.id,
    p_rider_handle: rider.handle,
    p_github_user_id: githubId,
  });
  if (!result?.ok) {
    const message =
      result?.error === 'not_author'
        ? 'Not your flight — the PR was opened by a different GitHub account.'
        : result?.error === 'already_claimed'
          ? 'This flight is already claimed.'
          : 'Claim failed.';
    return json(result?.error === 'not_author' ? 403 : 409, { error: message });
  }

  await syncClaimsAndRank(env, rider.id);
  const claimable = await rpc<{ count: number }>(env, 'claimable_for', { p_github_user_id: githubId });
  return json(200, { ok: true, already: result.already ?? false, claimable: Number(claimable?.count ?? 0) });
};
