import type { APIRoute } from 'astro';
import { slugTaken, publishedSlugExists, type SubmissionRow } from '../../../../lib/submissions.ts';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Move a draft or changes-requested submission into the review queue.
// Re-checks slug uniqueness at the moment of submit — the partial unique
// index on live-status slugs is the real guarantee behind this.
export const POST: APIRoute = async ({ locals, params }) => {
  const rider = locals.rider;
  if (!rider) return json(401, { error: 'Sign in first.' });
  const { env } = locals.runtime;

  const row = await env.DB.prepare('SELECT * FROM submissions WHERE id = ? AND rider_id = ?')
    .bind(params.id!, rider.id)
    .first<SubmissionRow>();
  if (!row) return json(404, { error: 'Not found.' });
  if (row.status !== 'draft' && row.status !== 'changes_requested') {
    return json(409, { error: `A ${row.status} submission can't be submitted.` });
  }

  if (await slugTaken(env.DB, row.slug, row.id)) {
    return json(409, { error: `Another submission already holds "${row.slug}".` });
  }
  if (row.kind === 'new' && (await publishedSlugExists(env.DB, row.slug))) {
    return json(409, { error: `A published log already lives at /logs/${row.slug}.` });
  }

  const now = new Date().toISOString();
  try {
    const result = await env.DB.prepare(
      `UPDATE submissions SET status = 'submitted', submitted_at = ?, updated_at = ?,
         reviewer_notes = NULL WHERE id = ? AND status IN ('draft','changes_requested')`,
    )
      .bind(now, now, row.id)
      .run();
    if (result.meta.changes !== 1) return json(409, { error: 'Could not submit — try again.' });
  } catch (error) {
    // The partial unique index fires if a race slipped a second live slug in.
    if (`${(error as Error).message}`.includes('UNIQUE constraint failed')) {
      return json(409, { error: `Another submission already holds "${row.slug}".` });
    }
    throw error;
  }

  return json(200, { id: row.id, status: 'submitted' });
};
