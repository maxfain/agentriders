import type { APIRoute } from 'astro';
import { logFrontmatterSchema } from '../../../../../lib/log-schema.ts';
import { serializeLog } from '../../../../../lib/frontmatter.ts';
import { commitLogFile } from '../../../../../lib/github.ts';
import { cascadeRank } from '../../../../../lib/ranks.ts';
import type { SubmissionRow } from '../../../../../lib/submissions.ts';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Approve → the single git write. Re-validate, serialize, commit the file
// via the bot. On success: status 'approved', optimistic published_logs
// mirror row so counts/directory update before the ~2-min rebuild lands.
// Reconcile flips 'approved' → 'published' once the file is actually live.
// A commit failure leaves the submission untouched and surfaces the error.
export const POST: APIRoute = async ({ locals, params }) => {
  const admin = locals.rider!; // middleware guarantees admin here
  const { env } = locals.runtime;

  const row = await env.DB.prepare(
    `SELECT s.*, r.handle AS rider_handle, r.display_name AS rider_name
     FROM submissions s JOIN riders r ON r.id = s.rider_id WHERE s.id = ?`,
  )
    .bind(params.id!)
    .first<SubmissionRow & { rider_handle: string; rider_name: string }>();
  if (!row) return json(404, { error: 'Not found.' });
  if (!['submitted', 'in_review'].includes(row.status)) {
    return json(409, { error: `A ${row.status} submission can't be approved.` });
  }

  // The schema is the same at build and here, so this can't fail the build.
  let frontmatter;
  try {
    frontmatter = logFrontmatterSchema.parse(JSON.parse(row.frontmatter_json));
  } catch {
    return json(422, { error: 'Stored frontmatter no longer validates — ask the rider to resave.' });
  }

  const markdown = serializeLog(frontmatter, row.body_md);
  let commitSha: string;
  try {
    commitSha = await commitLogFile(env, {
      slug: row.slug,
      markdown,
      handle: row.rider_handle,
      displayName: row.rider_name,
      kind: row.kind as 'new' | 'edit',
    });
  } catch (error) {
    // Parked, not lost — the submission stays reviewable and the admin sees why.
    return json(502, { error: `Commit failed: ${(error as Error).message}` });
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE submissions SET status = 'approved', commit_sha = ?, reviewed_by = ?,
         updated_at = ? WHERE id = ?`,
    ).bind(commitSha, admin.id, now, row.id),
    env.DB.prepare(
      `INSERT INTO published_logs
         (slug, rider_id, title, date, task, outcome, burns_count, submission_id, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET
         rider_id = COALESCE(published_logs.rider_id, excluded.rider_id),
         title = excluded.title, date = excluded.date,
         task = excluded.task, outcome = excluded.outcome,
         burns_count = excluded.burns_count, submission_id = excluded.submission_id`,
    ).bind(
      row.slug, row.rider_id, frontmatter.title, frontmatter.date, frontmatter.task,
      frontmatter.outcome, frontmatter.burns.length, row.id, now,
    ),
  ]);

  // The optimistic mirror write just changed this rider's flight count, so
  // recompute their rank now (first flight → Fledgling, without waiting for
  // reconcile). Rank is non-critical; never fail the approve over it.
  try {
    await cascadeRank(env.DB, [row.rider_id], 'system', 'published_flight');
  } catch {
    /* rank catches up on the next reconcile */
  }

  return json(200, { ok: true, status: 'approved', commit_sha: commitSha, slug: row.slug });
};
