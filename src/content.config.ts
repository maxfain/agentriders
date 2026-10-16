import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { logFrontmatterShape } from './lib/log-schema';

// Every authored collection carries published/updated (backfilled from git
// history; real updates only) and an author, so templates can render a
// byline and <time>, and the sitemap and JSON-LD can say when a page changed.
// The S1 fields (docs/seo-aeo-plan.md §3.2, §5.2): `summary` is the 40–60
// word literal answer rendered first in the prose column; `seoTitle` leads
// with the industry term and becomes the <title>; `faq` is the visible
// "Questions riders ask" section (no FAQPage markup — the text is the point).
const faq = z.array(z.object({ q: z.string(), a: z.string() })).default([]);

// The Field Manual holds two kinds of page. The 7 numbered `chapter`s are the
// canonical long-form reference (kind:'chapter', the default — their
// frontmatter is untouched). `guide`s are the S2 sibling pages (kill-switch,
// spend-cap, scope-cap-kill-compared, docs/seo-aeo-plan.md §3.3): no chapter
// number, with `sources` (cited references) and `lastVerified` (the date the
// cross-tool facts were checked) rendered by the template.
const manual = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/manual' }),
  schema: z.object({
    title: z.string(),
    seoTitle: z.string().optional(),
    chapter: z.number().int().positive().optional(),
    kind: z.enum(['chapter', 'guide']).default('chapter'),
    description: z.string(),
    summary: z.string(),
    startHere: z.boolean().default(false),
    published: z.coerce.date(),
    updated: z.coerce.date(),
    author: z.string().default('AgentRiders'),
    sources: z.array(z.string()).default([]),
    lastVerified: z.coerce.date().optional(),
    draft: z.boolean().default(false),
    faq,
  }),
});

// Single source of truth for log frontmatter lives in src/lib/log-schema.ts
// (shared with the submissions API). The content collection coerces `date`
// to a Date object for templates; everything else is the shared shape.
const logs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/logs' }),
  schema: z.object({
    ...logFrontmatterShape,
    date: z.coerce.date(),
  }),
});

const training = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/training' }),
  schema: z.object({
    title: z.string(), seoTitle: z.string().optional(), order: z.number().int().min(1).max(6),
    description: z.string(), summary: z.string(),
    duration: z.string(), level: z.enum(['Fledgling', 'Rider', 'Wingleader']),
    art: z.enum(['yard', 'workbench', 'wing']), outcome: z.string(),
    download: z.string(), weakPrompt: z.string(), strongPrompt: z.string(),
    published: z.coerce.date(), updated: z.coerce.date(),
    author: z.string().default('AgentRiders'),
    faq,
  }),
});
const missions = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/missions' }),
  schema: z.object({
    title: z.string(), seoTitle: z.string().optional(), description: z.string(), summary: z.string(),
    audience: z.string(),
    duration: z.string(), art: z.enum(['yard', 'workbench', 'wing']), outcome: z.string(),
    published: z.coerce.date(), updated: z.coerce.date(),
    author: z.string().default('AgentRiders'),
    faq,
  }),
});
// The flight-data pages (/data/: methodology, schema, the-550-dollar-flight)
// and the rider explainers (/riders/ranks/, /riders/verified-flight/) share
// one authored shape: a literal `summary`, a byline, cited `sources` and an
// optional `lastVerified` (docs/seo-aeo-plan.md §3.3, §4.5). They are separate
// collections because they live under different hubs and carry different
// JSON-LD (Article/TechArticle) and breadcrumbs.
const docShape = {
  title: z.string(),
  seoTitle: z.string().optional(),
  description: z.string(),
  summary: z.string(),
  published: z.coerce.date(),
  updated: z.coerce.date(),
  author: z.string().default('AgentRiders'),
  sources: z.array(z.string()).default([]),
  lastVerified: z.coerce.date().optional(),
  faq,
};

const data = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/data' }),
  schema: z.object(docShape),
});

const explainer = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/explainer' }),
  schema: z.object(docShape),
});

// The burns registry (docs/seo-aeo-plan.md §3.2, §4.4, S3): one page per named
// failure pattern, plus the first-ten-minutes checklist. Each carries the S1
// literal-answer fields (summary, seoTitle, faq) and the registry's own:
// `plain_name` (the industry term shown in the hub list), `status`
// (logged|illustrative — absent for the checklist), `pattern` (the slug a
// log's burns[].pattern matches, absent for the checklist), `logged_examples`
// (slugs named by the draft), and `related_chapter`/`related_lesson` for the
// "Related" trail. The logged-examples list is also joined from the logs
// collection at build (src/pages/burns/[pattern].astro).
const burnPatterns = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/burn-patterns' }),
  schema: z.object({
    title: z.string(),
    seoTitle: z.string().optional(),
    description: z.string(),
    summary: z.string(),
    pattern: z.string().optional(),
    plain_name: z.string(),
    status: z.enum(['logged', 'illustrative']).optional(),
    logged_examples: z.array(z.string()).default([]),
    related_chapter: z.string().optional(),
    related_lesson: z.string().optional(),
    kind: z.string().optional(),
    published: z.coerce.date(),
    updated: z.coerce.date(),
    author: z.string().default('AgentRiders'),
    faq,
  }),
});

export const collections = { manual, logs, training, missions, data, explainer, burnPatterns };
