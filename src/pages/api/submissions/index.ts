import type { APIRoute } from 'astro';
import { z } from 'zod';
import { rateLimit } from '../../../lib/ratelimit.ts';
import {
  buildSubmission,
  countInFlight,
  slugTaken,
  publishedSlugExists,
  MAX_IN_FLIGHT,
  MAX_PER_DAY,
} from '../../../lib/submissions.ts';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Create a draft submission. The composer saves here first, then PUTs
// updates to /api/submissions/[id] and submits via .../submit.
export const POST: APIRoute = async ({ locals, request }) => {
  const rider = locals.rider;
  if (!rider) return json(401, { error: 'Sign in first.' });
  if (rider.handle.startsWith('pending-')) return json(403, { error: 'Claim a handle first.' });

  const { env } = locals.runtime;

  // Daily create cap (abuse damping; the real guards are the DB constraints).
  if (!(await rateLimit(env.RATE, `sub:day:${rider.id}`, MAX_PER_DAY, 24 * 3600))) {
    return json(429, { error: `That's ${MAX_PER_DAY} drafts today. Come back tomorrow.` });
  }
  if ((await countInFlight(env.DB, rider.id)) >= MAX_IN_FLIGHT) {
    return json(409, {
      error: `You have ${MAX_IN_FLIGHT} submissions in review already. Finish those first.`,
    });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: 'Send a JSON body.' });
  }

  let built;
  try {
    built = buildSubmission(payload as never, rider.handle);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json(422, { error: 'Some fields need fixing.', issues: error.issues });
    }
    return json(400, { error: (error as Error).message });
  }

  if (await slugTaken(env.DB, built.slug)) {
    return json(409, { error: `A submission for "${built.slug}" is already in the queue.` });
  }
  if (built.kind === 'new' && (await publishedSlugExists(env.DB, built.slug))) {
    return json(409, { error: `A published log already lives at /logs/${built.slug}.` });
  }
  if (built.kind === 'edit' && !(await publishedSlugExists(env.DB, built.target_log_slug!))) {
    return json(404, { error: 'That log does not exist to edit.' });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO submissions
       (id, rider_id, kind, target_log_slug, slug, title, frontmatter_json, body_md,
        status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
  )
    .bind(
      id,
      rider.id,
      built.kind,
      built.target_log_slug,
      built.slug,
      built.title,
      JSON.stringify(built.frontmatter),
      built.body_md,
      now,
      now,
    )
    .run();

  return json(201, { id, slug: built.slug, status: 'draft' });
};
