import type { APIRoute } from 'astro';
import { sha256Hex } from '../../../../lib/crypto';
import { rateLimit } from '../../../../lib/ratelimit';
import { findOrCreateRider, completeSignIn } from '../../../../lib/auth';

export const prerender = false;

// Per-IP cap on verify attempts — defense-in-depth against token probing on
// top of the token's own entropy and single-use consumption.
const verifyAllowed = (env: AgentRidersEnv, request: Request) =>
  rateLimit(env.RATE, `magicverify:${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`, 30, 3600);

// Sign-in is a two-step on purpose: the emailed link is a GET, and mail
// scanners (SafeLinks, Mimecast, link previews) prefetch GETs — so the
// GET is read-only and renders a confirm button, and only the button's
// same-origin POST consumes the token and opens the session. That also
// closes login-CSRF: a cross-origin POST fails the origin checks.

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{16,128}$/;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.slice(0, 1)}•••@${domain}`;
}

const confirmPage = (token: string, email: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Confirm sign-in — AgentRiders</title>
<style>
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: #16130F; color: #EDE5D8; font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 420px; padding: 40px 24px; text-align: center; }
  .micro { font-family: ui-monospace, monospace; font-size: 11px; letter-spacing: 0.2em; color: #8E8578; text-transform: uppercase; }
  h1 { font-size: 26px; margin: 14px 0 8px; }
  p { color: #C9BFAF; font-size: 14px; }
  button { margin-top: 22px; padding: 14px 28px; border: 0; background: #E4572E; color: #16130F; font-weight: 700; font-size: 15px; cursor: pointer; }
  button:hover { background: #F06A41; }
</style>
</head>
<body>
<main>
  <p class="micro">AgentRiders</p>
  <h1>Confirm sign-in</h1>
  <p>Signing in as <strong>${escapeHtml(maskEmail(email))}</strong>. The link works once — this click uses it.</p>
  <form method="post" action="/api/auth/magic/verify">
    <input type="hidden" name="token" value="${escapeHtml(token)}" />
    <button type="submit">Sign in →</button>
  </form>
</main>
</body>
</html>`;

// Read-only: show the confirm page if the token is still live.
export const GET: APIRoute = async ({ locals, url, redirect, request }) => {
  const { env } = locals.runtime;
  if (!(await verifyAllowed(env, request))) return redirect('/join?error=too_many', 302);
  const token = url.searchParams.get('token') ?? '';
  if (!TOKEN_SHAPE.test(token) || !env.SESSION_PEPPER) {
    return redirect('/join?error=link_invalid', 302);
  }
  const row = await env.DB.prepare(
    'SELECT email, consumed_at, expires_at FROM magic_link_tokens WHERE token_hash = ?',
  )
    .bind(await sha256Hex(`${token}${env.SESSION_PEPPER}`))
    .first<{ email: string; consumed_at: string | null; expires_at: string }>();
  if (!row || row.consumed_at || new Date(row.expires_at) <= new Date()) {
    return redirect('/join?error=link_expired', 302);
  }
  return new Response(confirmPage(token, row.email), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
};

// The consuming step. Single-use is the conditional UPDATE — whichever
// request flips consumed_at first wins, atomically.
export const POST: APIRoute = async (context) => {
  const { locals, request, redirect } = context;
  const { env } = locals.runtime;
  if (!(await verifyAllowed(env, request))) return redirect('/join?error=too_many', 302);
  let token = '';
  try {
    token = String((await request.formData()).get('token') ?? '');
  } catch {
    return redirect('/join?error=link_invalid', 302);
  }
  if (!TOKEN_SHAPE.test(token) || !env.SESSION_PEPPER) {
    return redirect('/join?error=link_invalid', 302);
  }

  const tokenHash = await sha256Hex(`${token}${env.SESSION_PEPPER}`);
  const nowIso = new Date().toISOString();
  // Consume and read the email in one atomic statement — no follow-up SELECT,
  // so a GC sweep that deletes the now-consumed token can't race the read.
  const consumed = await env.DB.prepare(
    `UPDATE magic_link_tokens SET consumed_at = ?
     WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?
     RETURNING email`,
  )
    .bind(nowIso, tokenHash, nowIso)
    .first<{ email: string }>();
  if (!consumed) return redirect('/join?error=link_expired', 302);

  // The token is spent; nothing past this point may surface as a raw 500.
  try {
    const rider = await findOrCreateRider(env.DB, 'email', consumed.email, { email: consumed.email });
    const dest = await completeSignIn(context, env.DB, env.SESSION_PEPPER, rider);
    return redirect(dest, 302);
  } catch {
    return redirect('/join?error=signin_failed', 302);
  }
};
