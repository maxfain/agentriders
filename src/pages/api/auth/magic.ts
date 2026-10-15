import type { APIRoute } from 'astro';
import { randomToken, sha256Hex } from '../../../lib/crypto';
import { rateLimit } from '../../../lib/ratelimit';
import { sendMagicLinkEmail } from '../../../lib/email';

export const prerender = false;

const TOKEN_TTL_MS = 15 * 60 * 1000;
// Loose on purpose: Resend bounces what isn't deliverable. This only
// keeps junk out of the table.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Request a magic sign-in link. The response never says whether the email
// has an account — every deliverable address gets the same { ok: true }.
export const POST: APIRoute = async ({ locals, request, url }) => {
  const { env } = locals.runtime;
  const devEcho = env.DEV_MAGIC_ECHO === '1';
  if (!env.SESSION_PEPPER || (!env.RESEND_API_KEY && !devEcho)) {
    return json(503, { error: 'Email sign-in is not configured yet.' });
  }

  let email = '';
  try {
    const body = (await request.json()) as { email?: string };
    email = (body.email ?? '').trim().toLowerCase();
  } catch {
    return json(400, { error: 'Send JSON: { "email": "you@example.com" }' });
  }
  if (!EMAIL_SHAPE.test(email) || email.length > 254) {
    return json(400, { error: 'That does not look like an email address.' });
  }

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const [emailOk, ipOk] = await Promise.all([
    rateLimit(env.RATE, `magic:email:${await sha256Hex(email)}`, 3, 3600),
    rateLimit(env.RATE, `magic:ip:${ip}`, 10, 3600),
  ]);
  if (!emailOk || !ipOk) {
    return json(429, { error: 'Too many sign-in links requested. Try again in an hour.' });
  }

  const token = randomToken(32);
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO magic_link_tokens (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)',
  )
    .bind(
      await sha256Hex(`${token}${env.SESSION_PEPPER}`),
      email,
      new Date(now).toISOString(),
      new Date(now + TOKEN_TTL_MS).toISOString(),
    )
    .run();

  const link = `${url.origin}/api/auth/magic/verify?token=${token}`;
  if (env.RESEND_API_KEY) {
    try {
      await sendMagicLinkEmail(env.RESEND_API_KEY, email, link);
    } catch {
      return json(502, { error: 'Could not send the email. Try again shortly.' });
    }
  }
  // DEV_MAGIC_ECHO short-circuits email delivery for local testing only.
  return json(200, devEcho ? { ok: true, link } : { ok: true });
};
