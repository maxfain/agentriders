// Manage one claimed flight: POST { visibility: "public" | "hidden" } or
// POST { note: "..." } (≤280 chars — "What I'd do differently", the only
// rider-written text on a flight page; empty string clears it). Only the
// claiming rider can change either; the RPCs enforce it again in SQL.

import type { APIRoute } from 'astro';
import { rateLimit } from '../../../lib/ratelimit';
import { flightlogConfigured, rpc } from '../../../lib/flightlog';
import { readJsonCapped, BodyTooLargeError } from '../../../lib/http';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ locals, params, request }) => {
  const rider = locals.rider;
  if (!rider) return json(401, { error: 'Sign in first.' });
  const { env } = locals.runtime;
  if (!flightlogConfigured(env)) return json(503, { error: 'The flight log is not configured yet.' });
  const flightId = Number(params.id);
  if (!Number.isInteger(flightId) || flightId < 1) return json(400, { error: 'Bad flight id.' });
  if (!(await rateLimit(env.RATE, `flmanage:${rider.id}`, 60, 3600))) {
    return json(429, { error: 'Too many changes. Try again in an hour.' });
  }

  let body: { visibility?: string; note?: string };
  try {
    body = (await readJsonCapped(request)) as typeof body;
  } catch (error) {
    if (error instanceof BodyTooLargeError) return json(413, { error: 'Request body too large.' });
    return json(400, { error: 'Send JSON: { "visibility": "hidden" } or { "note": "..." }' });
  }

  if (body.visibility !== undefined) {
    if (body.visibility !== 'public' && body.visibility !== 'hidden') {
      return json(400, { error: 'visibility must be "public" or "hidden".' });
    }
    const result = await rpc<{ ok: boolean; error?: string }>(env, 'set_claim_visibility', {
      p_flight_id: flightId, p_rider_id: rider.id, p_visibility: body.visibility,
    });
    if (!result?.ok) return json(403, { error: 'Not your flight.' });
    return json(200, { ok: true, visibility: body.visibility });
  }

  if (body.note !== undefined) {
    const note = String(body.note).trim().slice(0, 280);
    const result = await rpc<{ ok: boolean; error?: string }>(env, 'set_claim_note', {
      p_flight_id: flightId, p_rider_id: rider.id, p_note: note,
    });
    if (!result?.ok) return json(403, { error: 'Not your flight.' });
    return json(200, { ok: true, note: note || null });
  }

  return json(400, { error: 'Nothing to change.' });
};
