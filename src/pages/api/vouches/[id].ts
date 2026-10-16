import type { APIRoute } from 'astro';
import type { VouchRow } from '../../../lib/vouches.ts';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Revoke a vouch you gave. Voluntary revocation NEVER demotes the vouchee —
// no weaponized revocation — so we flip the status and deliberately do not
// recompute the vouchee's rank. (Moderation removal is the admin path, and
// it does recompute.)
export const DELETE: APIRoute = async ({ locals, params }) => {
  const rider = locals.rider;
  if (!rider) return json(401, { error: 'Sign in first.' });
  const { env } = locals.runtime;

  const row = await env.DB.prepare('SELECT * FROM vouches WHERE id = ?')
    .bind(params.id!)
    .first<VouchRow>();
  if (!row || row.voucher_id !== rider.id) {
    return json(404, { error: 'Not found.' });
  }
  if (row.status !== 'active') {
    return json(409, { error: `This vouch is already ${row.status}.` });
  }

  await env.DB.prepare("UPDATE vouches SET status = 'revoked' WHERE id = ? AND voucher_id = ?")
    .bind(row.id, rider.id)
    .run();
  return json(200, { ok: true });
};
