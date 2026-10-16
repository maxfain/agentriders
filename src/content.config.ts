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

const manual = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/manual' }),
  schema: z.object({
    title: z.string(),
    seoTitle: z.string().optional(),
    chapter: z.number().int().positive(),
    description: z.string(),
    summary: z.string(),
    startHere: z.boolean().default(false),
    published: z.coerce.date(),
    updated: z.coerce.date(),
    author: z.string().default('AgentRiders'),
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
export const collections = { manual, logs, training, missions };
