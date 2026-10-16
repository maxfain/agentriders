import type { APIRoute } from 'astro';
import { cascadeRank } from '../../../../../lib/ranks.ts';
import type { RiderRow } from '../../../../../lib/session.ts';

const VOUCH_RANKS = new Set(['rider', 'wingleader']);

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const GRANTABLE = new Set(['fledgling', 'rider', 'wingleader']);

// Manual rank grant — the only path to Wingleader (its "runs a wing"
// requirement can't be met while Wings are deferred), and an admin override
// for the others. Writes the rank + an audited rank_events row.
export const POST: APIRoute = async ({ locals, params, request }) => {
  const { env } = locals.runtime; // middleware guarantees admin
  const admin = locals.rider!;

  let body: { rank?: string | null };
  try {
    body = (await request.json()) as { rank?: string | null };
  } catch {
    return json(400, { error: 'Send JSON: { rank }.' });
  }
  const newRank = body.rank ?? null;
  if (newRank !== null && !GRANTABLE.has(newRank)) {
    return json(400, { error: 'rank must be fledgling, rider, wingleader, or null.' });
  }

  const rider = await env.DB.prepare('SELECT id, handle, rank FROM riders WHERE handle = ?')
    .bind((params.handle ?? '').toLowerCase())
    .first<RiderRow>();
  if (!rider) return json(404, { error: 'No such rider.' });
  if (rider.rank === newRank) return json(200, { ok: true, rank: newRank });

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE riders SET rank = ? WHERE id = ?').bind(newRank, rider.id),
    env.DB.prepare(
      `INSERT INTO rank_events (id, rider_id, old_rank, new_rank, reason, actor, created_at)
       VALUES (?, ?, ?, ?, 'admin_grant', ?, ?)`,
    ).bind(crypto.randomUUID(), rider.id, rider.rank, newRank, `admin:${admin.handle}`, now),
  ]);

  // If this grant crossed the Rider boundary, this rider's outbound vouches
  // started or stopped counting — ripple to everyone they vouched for.
  const wasVoucher = VOUCH_RANKS.has(rider.rank ?? '');
  const nowVoucher = VOUCH_RANKS.has(newRank ?? '');
  if (wasVoucher !== nowVoucher) {
    const vouchees = (
      await env.DB.prepare(
        "SELECT DISTINCT vouchee_id FROM vouches WHERE voucher_id = ? AND status = 'active'",
      )
        .bind(rider.id)
        .all<{ vouchee_id: string }>()
    ).results?.map((v) => v.vouchee_id) ?? [];
    try {
      await cascadeRank(env.DB, vouchees, `admin:${admin.handle}`, 'voucher_rank_change', {
        allowDemotion: !nowVoucher, // dropped below Rider → demote; raised → promote
      });
    } catch {
      /* non-critical */
    }
  }

  return json(200, { ok: true, rank: newRank });
};
