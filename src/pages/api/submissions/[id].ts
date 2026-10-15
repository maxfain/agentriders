import type { APIRoute } from 'astro';
import { z } from 'zod';
import {
  buildSubmission,
  slugTaken,
  publishedSlugExists,
  EDITABLE_STATUSES,
  type SubmissionRow,
} from '../../../lib/submissions.ts';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function ownSubmission(
  db: D1Database,
  id: string,
  riderId: string,
): Promise<SubmissionRow | null> {
  return db
    .prepare('SELECT * FROM submissions WHERE id = ? AND rider_id = ?')
    .bind(id, riderId)
    .first<SubmissionRow>();
}

// Read back the rider's own submission (powers the composer's edit mode).
export const GET: APIRoute = async ({ locals, params }) => {
  const rider = locals.rider;
  if (!rider) return json(401, { error: 'Sign in first.' });
  const row = await ownSubmission(locals.runtime.env.DB, params.id!, rider.id);
  if (!row) return json(404, { error: 'Not found.' });
  return json(200, {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    target_log_slug: row.target_log_slug,
    status: row.status,
    reviewer_notes: row.reviewer_notes,
    frontmatter: JSON.parse(row.frontmatter_json),
    body_md: row.body_md,
    updated_at: row.updated_at,
  });
};

// Update a draft or changes-requested submission in place.
export const PUT: APIRoute = async ({ locals, params, request }) => {
  const rider = locals.rider;
  if (!rider) return json(401, { error: 'Sign in first.' });
  const { env } = locals.runtime;

  const row = await ownSubmission(env.DB, params.id!, rider.id);
  if (!row) return json(404, { error: 'Not found.' });
  if (!EDITABLE_STATUSES.includes(row.status as never)) {
    return json(409, { error: `A ${row.status} submission can't be edited.` });
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

  // Slug may change while editing; keep the live-uniqueness guarantee.
  if (built.slug !== row.slug && (await slugTaken(env.DB, built.slug, row.id))) {
    return json(409, { error: `A submission for "${built.slug}" is already in the queue.` });
  }
  if (built.kind === 'new' && built.slug !== row.slug && (await publishedSlugExists(env.DB, built.slug))) {
    return json(409, { error: `A published log already lives at /logs/${built.slug}.` });
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE submissions SET kind = ?, target_log_slug = ?, slug = ?, title = ?,
       frontmatter_json = ?, body_md = ?, updated_at = ? WHERE id = ? AND rider_id = ?`,
  )
    .bind(
      built.kind,
      built.target_log_slug,
      built.slug,
      built.title,
      JSON.stringify(built.frontmatter),
      built.body_md,
      now,
      row.id,
      rider.id,
    )
    .run();

  return json(200, { id: row.id, slug: built.slug, status: row.status });
};

// Discard a draft (only while it's the rider's and still a draft).
export const DELETE: APIRoute = async ({ locals, params }) => {
  const rider = locals.rider;
  if (!rider) return json(401, { error: 'Sign in first.' });
  const { env } = locals.runtime;
  const result = await env.DB.prepare(
    "DELETE FROM submissions WHERE id = ? AND rider_id = ? AND status = 'draft'",
  )
    .bind(params.id!, rider.id)
    .run();
  if (result.meta.changes !== 1) return json(409, { error: 'Only your own draft can be discarded.' });
  return json(200, { ok: true });
};
