import type { APIRoute } from 'astro';
import { rateLimit } from '../../../lib/ratelimit';
import { consumeLinkCode, registerDevice } from '../../../lib/devices';
import { deviceFingerprint } from '../../../lib/verify';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Exchange a link code + Ed25519 public key for a registered device. Called by
// `agentriders login` — no session cookie (it's a CLI), so authorization is
// the code itself. Rate-limited by IP to blunt code guessing.
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  if (!env.SESSION_PEPPER) return json(503, { error: 'Device pairing is not configured.' });

  // CF-Connecting-IP is set by Cloudflare; Pages Functions are not reachable
  // off-CF. The code's own single-use + 10-min expiry + ~40-bit entropy are
  // the real brute-force control, with this per-IP cap as a floodwall.
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (!(await rateLimit(env.RATE, `devlink:${ip}`, 30, 3600))) {
    return json(429, { error: 'Too many attempts. Try again later.' });
  }

  let body: { code?: unknown; public_key?: unknown; name?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json(400, { error: 'Send JSON: { code, public_key, name }.' });
  }
  const code = typeof body.code === 'string' ? body.code : '';
  const publicKey = typeof body.public_key === 'string' ? body.public_key : '';
  const name = typeof body.name === 'string' ? body.name : null;
  if (!code || !publicKey) return json(400, { error: 'code and public_key are required.' });

  // Validate the key shape BEFORE consuming the code, so a typo'd key doesn't
  // burn a valid code.
  try {
    await deviceFingerprint(publicKey);
  } catch {
    return json(400, { error: 'public_key must be a base64 32-byte Ed25519 key.' });
  }

  const riderId = await consumeLinkCode(env.DB, env.SESSION_PEPPER, code);
  if (!riderId) return json(400, { error: 'That code is invalid or expired. Mint a new one.' });

  const result = await registerDevice(env.DB, riderId, publicKey, name);
  if (!result.ok) return json(result.status, { error: result.reason });

  const rider = await env.DB.prepare('SELECT handle, display_name FROM riders WHERE id = ?')
    .bind(riderId)
    .first<{ handle: string; display_name: string }>();

  return json(200, {
    ok: true,
    device_id: result.deviceId,
    reused: result.reused,
    handle: rider?.handle ?? null,
    display_name: rider?.display_name ?? null,
  });
};
