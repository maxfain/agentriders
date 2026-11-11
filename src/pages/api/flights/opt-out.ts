// Author opt-out (docs/flight-log-corpus.md, Consent): sign in with GitHub,
// one button, done. Sets authors.opted_out in the corpus — every flight by
// that account leaves rendering, JSON, sitemaps and aggregates, and its
// pages answer 410 Gone. The row stays so the pipeline never re-creates it.
// POST { optedOut: true | false } — reversible by the same proof.

import type { APIRoute } from 'astro';
import { rateLimit } from '../../../lib/ratelimit';
import { flightlogConfigured, githubIdentityOf, rpc } from '../../../lib/flightlog';
import { readJsonCapped, BodyTooLargeError } from '../../../lib/http';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ locals, request }) => {
  const rider = locals.rider;
  if (!rider) return json(401, { error: 'Sign in first.' });
  const { env } = locals.runtime;
  if (!flightlogConfigured(env)) return json(503, { error: 'The flight log is not configured yet.' });
  if (!(await rateLimit(env.RATE, `floptout:${rider.id}`, 10, 3600))) {
    return json(429, { error: 'Too many attempts. Try again in an hour.' });
  }
  const githubId = await githubIdentityOf(env.DB, rider.id);
  if (githubId === null) {
    return json(403, { error: 'Opting out needs a GitHub sign-in, so it only ever covers your own account.' });
  }

  // The body is optional ({ "optedOut": false } undoes an opt-out); absent or
  // malformed defaults to opting out. Only an oversized stream is an error —
  // the capped read stops it before it is buffered.
  let optedOut = true;
  try {
    const body = (await readJsonCapped(request)) as { optedOut?: boolean };
    optedOut = body?.optedOut !== false;
  } catch (error) {
    if (error instanceof BodyTooLargeError) return json(413, { error: 'Request body too large.' });
    /* default: opt out */
  }

  const result = await rpc<{ ok: boolean }>(env, 'opt_out_author', {
    p_github_user_id: githubId,
    p_opted_out: optedOut,
  });
  if (!result?.ok) return json(500, { error: 'Opt-out failed — email hello@agentriders.com and we will do it by hand.' });
  return json(200, { ok: true, optedOut });
};
