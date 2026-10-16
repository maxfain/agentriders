import type { APIRoute } from 'astro';
import { sweepExpired } from '../../../lib/gc';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Admin-only (middleware gates /api/admin/*). Sweep expired sessions and spent
// magic-link tokens / device codes. Bounded per call; run again to clear a
// large backlog.
export const POST: APIRoute = async ({ locals }) => {
  const result = await sweepExpired(locals.runtime.env.DB);
  return json(200, { ok: true, ...result });
};
