import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { logFrontmatterShape } from './lib/log-schema';

const manual = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/manual' }),
  schema: z.object({
    title: z.string(),
    chapter: z.number().int().positive(),
    description: z.string(),
    startHere: z.boolean().default(false),
    updated: z.coerce.date(),
    draft: z.boolean().default(false),
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
    title: z.string(), order: z.number().int().min(1).max(6), description: z.string(),
    duration: z.string(), level: z.enum(['Fledgling', 'Rider', 'Wingleader']),
    art: z.enum(['yard', 'workbench', 'wing']), outcome: z.string(),
    download: z.string(), weakPrompt: z.string(), strongPrompt: z.string(),
  }),
});
const missions = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/missions' }),
  schema: z.object({
    title: z.string(), description: z.string(), audience: z.string(),
    duration: z.string(), art: z.enum(['yard', 'workbench', 'wing']), outcome: z.string(),
  }),
});
export const collections = { manual, logs, training, missions };
