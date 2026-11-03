// The signed-in rider's corpus flights: claimed ones (with visibility and
// note) plus how many unclaimed flights their GitHub account still has.
// Powers /me/flights/.

import type { APIRoute } from 'astro';
import { flightlogConfigured, githubIdentityOf, rpc, type RiderFlights } from '../../../lib/flightlog';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const GET: APIRoute = async ({ locals }) => {
  const rider = locals.rider;
  if (!rider) return json(401, { error: 'Sign in first.' });
  const { env } = locals.runtime;
  if (!flightlogConfigured(env)) return json(200, { configured: false, flights: [], total: 0, claimable: 0 });

  const mine = await rpc<RiderFlights>(env, 'rider_flights', { p_rider_id: rider.id });
  const githubId = await githubIdentityOf(env.DB, rider.id);
  const claimable = githubId === null
    ? { count: 0, sample: [] }
    : await rpc<{ count: number; sample: unknown[] }>(env, 'claimable_for', { p_github_user_id: githubId });

  return json(200, {
    configured: true,
    total: Number(mine?.total ?? 0),
    public: Number(mine?.public ?? 0),
    flights: mine?.flights ?? [],
    claimable: Number(claimable?.count ?? 0),
    claimableSample: claimable?.sample ?? [],
    hasGithub: githubId !== null,
  });
};
