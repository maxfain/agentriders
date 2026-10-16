import type { APIRoute } from 'astro';
import { rateLimit } from '../../../lib/ratelimit.ts';
import { cascadeRank } from '../../../lib/ranks.ts';
import {
  canVouch,
  validateStatement,
  existingVouch,
  MAX_VOUCHES_PER_DAY,
} from '../../../lib/vouches.ts';
import type { RiderRow } from '../../../lib/session.ts';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Create (or re-activate) a vouch for another rider.
export const POST: APIRoute = async ({ locals, request }) => {
  const voucher = locals.rider;
  if (!voucher) return json(401, { error: 'Sign in first.' });
  if (!canVouch(voucher.rank)) {
    return json(403, { error: 'Only Riders and above can vouch. Earn your rank first.' });
  }

  const { env } = locals.runtime;

  let payload: { vouchee_handle?: string; statement?: string };
  try {
    payload = (await request.json()) as { vouchee_handle?: string; statement?: string };
  } catch {
    return json(400, { error: 'Send JSON: { vouchee_handle, statement }.' });
  }

  const handle = (payload.vouchee_handle ?? '').trim().toLowerCase();
  const statementCheck = validateStatement(payload.statement ?? '');
  if (!statementCheck.ok) return json(400, { error: statementCheck.reason });

  const vouchee = await env.DB.prepare(
    "SELECT id, handle, banned_at FROM riders WHERE handle = ? AND handle NOT LIKE 'pending-%'",
  )
    .bind(handle)
    .first<RiderRow>();
  if (!vouchee || vouchee.banned_at) return json(404, { error: 'No such rider.' });
  if (vouchee.id === voucher.id) return json(400, { error: 'You cannot vouch for yourself.' });

  const now = new Date().toISOString();
  const existing = await existingVouch(env.DB, voucher.id, vouchee.id);
  if (existing && existing.status === 'active') {
    return json(409, { error: `You already vouch for @${vouchee.handle}.` });
  }
  if (existing && existing.status === 'removed') {
    return json(403, { error: 'This vouch was removed by moderation and cannot be remade.' });
  }

  // Charge the daily budget only for a real create/reactivation — the no-op
  // rejections above must not burn the rider's allowance.
  if (!(await rateLimit(env.RATE, `vouch:${voucher.id}`, MAX_VOUCHES_PER_DAY, 24 * 3600))) {
    return json(429, { error: `That's ${MAX_VOUCHES_PER_DAY} vouches today. Come back tomorrow.` });
  }

  if (existing) {
    // Revoked → re-activate with the new statement (the unique pair persists).
    await env.DB.prepare(
      "UPDATE vouches SET status = 'active', statement = ?, created_at = ? WHERE id = ?",
    )
      .bind(statementCheck.statement, now, existing.id)
      .run();
  } else {
    try {
      await env.DB.prepare(
        `INSERT INTO vouches (id, voucher_id, vouchee_id, statement, status, created_at)
         VALUES (?, ?, ?, ?, 'active', ?)`,
      )
        .bind(crypto.randomUUID(), voucher.id, vouchee.id, statementCheck.statement, now)
        .run();
    } catch (error) {
      if (`${(error as Error).message}`.includes('UNIQUE constraint failed')) {
        return json(409, { error: `You already vouch for @${vouchee.handle}.` });
      }
      throw error;
    }
  }

  // A new qualifying vouch can promote the vouchee to Rider, which can in
  // turn make their own vouches count — ripple it.
  try {
    await cascadeRank(env.DB, [vouchee.id], 'system', 'vouch_received');
  } catch {
    /* non-critical */
  }

  return json(201, { ok: true, vouchee: vouchee.handle });
};
