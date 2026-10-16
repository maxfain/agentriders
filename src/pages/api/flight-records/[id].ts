import type { APIRoute } from 'astro';
import { matchRecordToLog, unmatchRecord, deleteRecord } from '../../../lib/flight-records';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Link / unlink a record to a published log, from /me/devices. Session-gated:
// the rider must own both the record and the target flight. `{ log: null }`
// unlinks.
export const POST: APIRoute = async ({ locals, params, request }) => {
  const rider = locals.rider;
  if (!rider) return json(401, { error: 'Sign in first.' });
  const id = (params.id ?? '').trim();
  if (!id) return json(400, { error: 'Missing record id.' });

  let body: { log?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json(400, { error: 'Send JSON: { log }.' });
  }

  const { env } = locals.runtime;
  const slug = typeof body.log === 'string' ? body.log.trim() : '';
  if (!slug) {
    const did = await unmatchRecord(env.DB, rider.id, id);
    if (!did) return json(404, { error: 'No such record.' });
    return json(200, { ok: true, matched_log_slug: null });
  }

  const result = await matchRecordToLog(env.DB, rider.id, id, slug);
  if (!result.ok) return json(result.status, { error: result.reason });
  return json(200, { ok: true, matched_log_slug: slug });
};

// Delete a record the rider owns (e.g. uploaded the wrong session).
export const DELETE: APIRoute = async ({ locals, params }) => {
  const rider = locals.rider;
  if (!rider) return json(401, { error: 'Sign in first.' });
  const id = (params.id ?? '').trim();
  if (!id) return json(400, { error: 'Missing record id.' });

  const did = await deleteRecord(locals.runtime.env.DB, rider.id, id);
  if (!did) return json(404, { error: 'No such record.' });
  return json(200, { ok: true });
};
