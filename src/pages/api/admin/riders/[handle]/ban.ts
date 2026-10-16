import type { APIRoute } from 'astro';
import { cascadeRank } from '../../../../../lib/ranks.ts';
import type { RiderRow } from '../../../../../lib/session.ts';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Ban or unban a rider. Banning hides their profile, kills their sessions,
// and recomputes everyone they vouched for — a banned voucher no longer
// counts toward Rider, so vouch rings collapse. The git-committed logs
// themselves are untouched; removing published content stays a deliberate
// manual git act. An admin can't ban themselves or another admin.
export const POST: APIRoute = async ({ locals, params, request }) => {
  const { env } = locals.runtime; // middleware guarantees admin
  const admin = locals.rider!;

  let body: { banned?: boolean };
  try {
    body = (await request.json()) as { banned?: boolean };
  } catch {
    return json(400, { error: 'Send JSON: { banned: true|false }.' });
  }
  const banning = body.banned !== false;

  const rider = await env.DB.prepare(
    'SELECT id, handle, is_admin, banned_at FROM riders WHERE handle = ?',
  )
    .bind((params.handle ?? '').toLowerCase())
    .first<RiderRow>();
  if (!rider) return json(404, { error: 'No such rider.' });
  if (banning && (rider.id === admin.id || rider.is_admin === 1)) {
    return json(403, { error: 'Admins cannot be banned here.' });
  }

  const now = new Date().toISOString();
  const directVouchees = (
    await env.DB.prepare(
      "SELECT DISTINCT vouchee_id FROM vouches WHERE voucher_id = ? AND status = 'active'",
    )
      .bind(rider.id)
      .all<{ vouchee_id: string }>()
  ).results?.map((v) => v.vouchee_id) ?? [];

  if (banning) {
    await env.DB.batch([
      env.DB.prepare('UPDATE riders SET banned_at = ? WHERE id = ?').bind(now, rider.id),
      env.DB.prepare('DELETE FROM sessions WHERE rider_id = ?').bind(rider.id),
    ]);
    // The banned rider's vouches no longer qualify — ripple the demotion
    // through the whole sub-graph, not just the first hop.
    try {
      await cascadeRank(env.DB, directVouchees, `admin:${admin.handle}`, 'voucher_banned', {
        allowDemotion: true,
      });
    } catch {
      /* non-critical */
    }
  } else {
    await env.DB.prepare('UPDATE riders SET banned_at = NULL WHERE id = ?').bind(rider.id).run();
    // Their vouches qualify again — re-promote any vouchee that now earns it.
    try {
      await cascadeRank(env.DB, directVouchees, `admin:${admin.handle}`, 'voucher_unbanned');
    } catch {
      /* non-critical */
    }
  }

  return json(200, { ok: true, banned: banning });
};
