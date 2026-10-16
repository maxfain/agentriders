import { z } from 'zod';

// The one definition of a flight log's frontmatter. The content collection
// (src/content.config.ts) parses published markdown with it at build time,
// and the submissions API validates in-app drafts with it at request time —
// so an approved submission can never fail the build.
//
// `date` stays a string here (ISO yyyy-mm-dd) rather than z.coerce.date():
// this schema runs against raw form input and serializes back to YAML, where
// a string round-trips cleanly. The content collection re-wraps it with a
// coerced-date variant below for templates that want a Date object.

export const TASK_VALUES = ['code', 'ops', 'research', 'sales', 'writing', 'data', 'other'] as const;
export const OUTCOME_VALUES = ['landed', 'partial', 'aborted'] as const;

// Slug rules: lowercase, hyphenated, derived from the title but overridable.
// Kept distinct from handles (longer, no reserved list) but equally strict so
// it is safe as a file name and URL path. Declared here (above burnSchema) so
// the burn `pattern` field can reuse it.
export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

export const burnSchema = z.object({
  what: z.string().min(1).max(280),
  recovery: z.string().min(1).max(280),
  cost_usd: z.number().nonnegative().default(0),
  // The burns-registry pattern this burn is an instance of (S3,
  // docs/seo-aeo-plan.md §3.2). Optional so every existing log and every
  // MCP/CLI-filed burn without it still validates; when set it links the burn
  // to its /burns/<pattern>/ page. Same slug rules as a log slug.
  pattern: z.string().regex(SLUG_REGEX).optional(),
});

export const reinsSchema = z.object({
  scope: z.string().min(1).max(280),
  budget: z.string().min(1).max(120),
  kill_switch: z.string().min(1).max(120),
  autonomy: z.string().min(1).max(120),
});

// Shared field shape. ISO date string; everything bounded so a submission
// can't bloat a commit. draft defaults false (published logs are live).
export const logFrontmatterShape = {
  title: z.string().min(1).max(140),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use an ISO date, yyyy-mm-dd.')
    // A shape-valid but calendar-invalid date (2026-13-45) would pass the
    // regex, then crash the content collection's z.coerce.date() at build.
    .refine((s) => {
      const [y, m, d] = s.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
    }, 'Not a real calendar date.'),
  rider: z.string().min(1).max(60),
  mount: z.string().min(1).max(80),
  model: z.string().max(80).optional(),
  harness: z.string().max(80).optional(),
  task: z.enum(TASK_VALUES),
  duration: z.string().min(1).max(40),
  cost_usd: z.number().nonnegative(),
  outcome: z.enum(OUTCOME_VALUES),
  burns: z.array(burnSchema).max(20).default([]),
  lesson: z.string().min(1).max(500),
  reins: reinsSchema,
  draft: z.boolean().default(false),
};

export const logFrontmatterSchema = z.object(logFrontmatterShape);

export type LogFrontmatter = z.infer<typeof logFrontmatterSchema>;

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
    .replace(/-$/, '');
}

export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug);
}
