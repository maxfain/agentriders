import type { APIRoute } from 'astro';
import { revokeDevice } from '../../../lib/devices';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Revoke a device the signed-in rider owns. Future records signed by that key
// are rejected (existing records stay — they were valid when made).
export const DELETE: APIRoute = async ({ locals, params }) => {
  const rider = locals.rider;
  if (!rider) return json(401, { error: 'Sign in first.' });
  const id = (params.id ?? '').trim();
  if (!id) return json(400, { error: 'Missing device id.' });

  const revoked = await revokeDevice(locals.runtime.env.DB, rider.id, id);
  if (!revoked) return json(404, { error: 'No such active device.' });
  return json(200, { ok: true });
};
