import type { APIRoute } from 'astro';
import { isPendingHandle, validateHandle } from '../../../lib/handles';
import { rateLimit } from '../../../lib/ratelimit';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Claim a handle: once, while the rider still carries a generated
// "pending-…" one. Uniqueness is the UNIQUE constraint's job — a race on
// the same handle loses cleanly with a 409.
export const POST: APIRoute = async ({ locals, request }) => {
  const rider = locals.rider;
  if (!rider) return json(401, { error: 'Sign in first.' });
  if (!isPendingHandle(rider.handle)) {
    return json(409, { error: `You already fly as @${rider.handle}.` });
  }

  const { env } = locals.runtime;
  if (!(await rateLimit(env.RATE, `claim:${rider.id}`, 10, 3600))) {
    return json(429, { error: 'Too many attempts. Try again in an hour.' });
  }

  let handle = '';
  let displayName: string | null = null;
  try {
    const body = (await request.json()) as { handle?: string; displayName?: string };
    handle = (body.handle ?? '').trim().toLowerCase();
    displayName = body.displayName?.trim().slice(0, 60) || null;
  } catch {
    return json(400, { error: 'Send JSON: { "handle": "your-handle" }' });
  }

  const validation = validateHandle(handle);
  if (!validation.ok) return json(400, { error: validation.reason });

  try {
    const result = await env.DB.prepare(
      `UPDATE riders SET handle = ?, display_name = COALESCE(?, display_name)
       WHERE id = ? AND handle LIKE 'pending-%'`,
    )
      .bind(handle, displayName, rider.id)
      .run();
    if (result.meta.changes !== 1) {
      return json(409, { error: 'Your handle was already claimed.' });
    }
  } catch (error) {
    if (`${(error as Error).message}`.includes('UNIQUE constraint failed')) {
      return json(409, { error: `@${handle} is taken. Pick another.` });
    }
    throw error;
  }
  return json(200, { ok: true, handle });
};
