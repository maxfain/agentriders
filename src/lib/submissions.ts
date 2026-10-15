import { z } from 'zod';
import {
  logFrontmatterShape,
  logFrontmatterSchema,
  slugify,
  isValidSlug,
  type LogFrontmatter,
} from './log-schema.ts';

// Submission workflow + validation shared by the composer API and the admin
// approve path. The rider is always forced to the session handle server-side;
// `draft` in the file is always false (published logs are live).

export const LIVE_STATUSES = ['submitted', 'in_review', 'changes_requested', 'approved'] as const;
export const EDITABLE_STATUSES = ['draft', 'changes_requested'] as const;
export const MAX_IN_FLIGHT = 2;
export const MAX_PER_DAY = 5;

// Composer input = the log fields minus rider (forced) and draft (forced).
const { rider: _rider, draft: _draft, ...composerShape } = logFrontmatterShape;
export const composerSchema = z.object(composerShape);

export type SubmissionRow = {
  id: string;
  rider_id: string;
  kind: 'new' | 'edit';
  target_log_slug: string | null;
  slug: string;
  title: string;
  frontmatter_json: string;
  body_md: string;
  status: string;
  reviewer_notes: string | null;
  commit_sha: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  published_at: string | null;
};

export type ComposerPayload = z.infer<typeof composerSchema> & {
  slug?: string;
  body_md?: string;
  kind?: 'new' | 'edit';
  target_log_slug?: string;
};

export type BuiltSubmission = {
  slug: string;
  title: string;
  frontmatter: LogFrontmatter;
  body_md: string;
  kind: 'new' | 'edit';
  target_log_slug: string | null;
};

/**
 * Validate a composer payload into a storable submission. Forces rider to the
 * session handle and draft to false; derives/validates the slug. Throws a
 * zod error on bad fields, or a plain Error with a user message otherwise.
 */
export function buildSubmission(payload: ComposerPayload, handle: string): BuiltSubmission {
  const fields = composerSchema.parse(payload);
  const frontmatter = logFrontmatterSchema.parse({ ...fields, rider: handle, draft: false });

  const kind = payload.kind === 'edit' ? 'edit' : 'new';
  const rawSlug = (payload.slug ?? '').trim() || slugify(frontmatter.title);
  const slug = rawSlug.toLowerCase();
  if (!isValidSlug(slug)) {
    throw new Error('Could not form a valid slug from the title — add a short custom slug.');
  }
  const targetLogSlug = kind === 'edit' ? (payload.target_log_slug ?? slug) : null;

  return {
    slug,
    title: frontmatter.title,
    frontmatter,
    body_md: typeof payload.body_md === 'string' ? payload.body_md.slice(0, 20000) : '',
    kind,
    target_log_slug: targetLogSlug,
  };
}

/** Count a rider's submissions currently occupying a slug in the queue. */
export async function countInFlight(db: D1Database, riderId: string): Promise<number> {
  const placeholders = LIVE_STATUSES.map(() => '?').join(',');
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM submissions WHERE rider_id = ? AND status IN (${placeholders})`,
    )
    .bind(riderId, ...LIVE_STATUSES)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** True if a non-draft submission already holds this slug (live uniqueness). */
export async function slugTaken(db: D1Database, slug: string, exceptId?: string): Promise<boolean> {
  const placeholders = LIVE_STATUSES.map(() => '?').join(',');
  const row = await db
    .prepare(
      `SELECT id FROM submissions WHERE slug = ? AND status IN (${placeholders})${
        exceptId ? ' AND id != ?' : ''
      }`,
    )
    .bind(slug, ...LIVE_STATUSES, ...(exceptId ? [exceptId] : []))
    .first<{ id: string }>();
  return !!row;
}

/** True if a published log already owns this slug. */
export async function publishedSlugExists(db: D1Database, slug: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT slug FROM published_logs WHERE slug = ?')
    .bind(slug)
    .first<{ slug: string }>();
  return !!row;
}
