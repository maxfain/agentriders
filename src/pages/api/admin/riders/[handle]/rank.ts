import type { APIRoute } from 'astro';
import type { RiderRow } from '../../../../../lib/session.ts';

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
  return json(200, { ok: true, rank: newRank });
};
