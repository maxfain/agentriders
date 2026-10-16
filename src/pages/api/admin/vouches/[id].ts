import type { APIRoute } from 'astro';
import { cascadeRank } from '../../../../lib/ranks.ts';
import type { VouchRow } from '../../../../lib/vouches.ts';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Moderation removal of a vouch (distinct from a voucher's own revoke).
// Unlike voluntary revocation, this DOES recompute the vouchee with
// demotion allowed — a vouch removed for cause can cost a rank.
export const POST: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime; // middleware guarantees admin
  const row = await env.DB.prepare('SELECT * FROM vouches WHERE id = ?')
    .bind(params.id!)
    .first<VouchRow>();
  if (!row) return json(404, { error: 'Not found.' });

  await env.DB.prepare("UPDATE vouches SET status = 'removed' WHERE id = ?").bind(row.id).run();
  try {
    // Demotion may ripple: if the vouchee drops below Rider, their own
    // vouches stop counting too.
    await cascadeRank(env.DB, [row.vouchee_id], `admin:${locals.rider!.handle}`, 'vouch_removed', {
      allowDemotion: true,
    });
  } catch {
    /* non-critical */
  }
  return json(200, { ok: true });
};
