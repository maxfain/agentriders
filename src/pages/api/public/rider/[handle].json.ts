// Public profile facts for one rider — exactly what the profile page already
// shows (handle, rank, joined month), nothing more. The pipeline reads this
// when rendering rider share cards, so D1 stays the system of record for
// people without the pipeline ever touching D1.

import type { APIRoute } from 'astro';
import { validateHandle } from '../../../../lib/handles';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const { env } = locals.runtime;
  const handle = (params.handle ?? '').toLowerCase().replace(/\.json$/, '');
  if (!validateHandle(handle).ok) return new Response(null, { status: 404 });
  const rider = await env.DB.prepare(
    "SELECT handle, rank, created_at FROM riders WHERE handle = ? AND banned_at IS NULL AND handle NOT LIKE 'pending-%'",
  )
    .bind(handle)
    .first<{ handle: string; rank: string | null; created_at: string }>();
  if (!rider) return new Response(null, { status: 404 });
  return new Response(
    JSON.stringify({ handle: rider.handle, rank: rider.rank, joined: rider.created_at.slice(0, 7) }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300, s-maxage=600' } },
  );
};
