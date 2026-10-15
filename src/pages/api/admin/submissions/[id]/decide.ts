import type { APIRoute } from 'astro';
import type { SubmissionRow } from '../../../../../lib/submissions.ts';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Request changes or reject — both require reviewer notes and carry the
// submission back to the rider (changes_requested) or close it (rejected).
export const POST: APIRoute = async ({ locals, params, request }) => {
  const admin = locals.rider!; // middleware guarantees admin
  const { env } = locals.runtime;

  let body: { action?: string; notes?: string };
  try {
    body = (await request.json()) as { action?: string; notes?: string };
  } catch {
    return json(400, { error: 'Send a JSON body.' });
  }
  const action = body.action;
  const notes = (body.notes ?? '').trim();
  if (action !== 'request_changes' && action !== 'reject') {
    return json(400, { error: 'action must be request_changes or reject.' });
  }
  if (!notes) return json(400, { error: 'Reviewer notes are required.' });
  if (notes.length > 2000) return json(400, { error: 'Notes are too long (2000 max).' });

  const row = await env.DB.prepare('SELECT * FROM submissions WHERE id = ?')
    .bind(params.id!)
    .first<SubmissionRow>();
  if (!row) return json(404, { error: 'Not found.' });
  if (!['submitted', 'in_review'].includes(row.status)) {
    return json(409, { error: `A ${row.status} submission can't be decided.` });
  }

  const newStatus = action === 'request_changes' ? 'changes_requested' : 'rejected';
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE submissions SET status = ?, reviewer_notes = ?, reviewed_by = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(newStatus, notes, admin.id, now, row.id)
    .run();

  return json(200, { ok: true, status: newStatus });
};
