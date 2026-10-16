import type { APIRoute } from 'astro';
import { rateLimit } from '../../../lib/ratelimit';
import { createLinkCode, CODE_TTL_SECONDS } from '../../../lib/devices';
import { isPendingHandle } from '../../../lib/handles';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Mint a one-time device link code for the signed-in rider. Shown on
// /me/devices and pasted into `agentriders login`. Session-gated; the code
// itself is the bearer secret the CLI exchanges for a registered device.
export const POST: APIRoute = async ({ locals }) => {
  const rider = locals.rider;
  if (!rider) return json(401, { error: 'Sign in first.' });
  if (isPendingHandle(rider.handle)) return json(403, { error: 'Claim your handle first.' });

  const { env } = locals.runtime;
  if (!env.SESSION_PEPPER) return json(503, { error: 'Device pairing is not configured.' });
  if (!(await rateLimit(env.RATE, `devcode:${rider.id}`, 10, 3600))) {
    return json(429, { error: 'Too many codes. Try again in an hour.' });
  }

  const code = await createLinkCode(env.DB, env.SESSION_PEPPER, rider.id);
  return json(200, { code, expires_in: CODE_TTL_SECONDS });
};
