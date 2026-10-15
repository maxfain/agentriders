import type { APIRoute } from 'astro';
import { sha256Hex } from '../../../../lib/crypto';
import { findOrCreateRider, completeSignIn } from '../../../../lib/auth';

export const prerender = false;

// Consume a magic link: single-use is enforced by the conditional UPDATE —
// whichever request flips consumed_at first wins, atomically.
export const GET: APIRoute = async (context) => {
  const { locals, url, redirect } = context;
  const { env } = locals.runtime;
  const token = url.searchParams.get('token') ?? '';
  if (!token || !env.SESSION_PEPPER) return redirect('/join?error=link_invalid', 302);

  const tokenHash = await sha256Hex(`${token}${env.SESSION_PEPPER}`);
  const nowIso = new Date().toISOString();
  const consumed = await env.DB.prepare(
    `UPDATE magic_link_tokens SET consumed_at = ?
     WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?`,
  )
    .bind(nowIso, tokenHash, nowIso)
    .run();
  if (consumed.meta.changes !== 1) return redirect('/join?error=link_expired', 302);

  const row = await env.DB.prepare('SELECT email FROM magic_link_tokens WHERE token_hash = ?')
    .bind(tokenHash)
    .first<{ email: string }>();
  if (!row) return redirect('/join?error=link_invalid', 302);

  const rider = await findOrCreateRider(env.DB, 'email', row.email, { email: row.email });
  const dest = await completeSignIn(context, env.DB, env.SESSION_PEPPER, rider);
  return redirect(dest, 302);
};
