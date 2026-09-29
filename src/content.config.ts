import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

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

const logs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/logs' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    rider: z.string(), // plain text in Phase 1; links to /riders/[handle] in Phase 2
    mount: z.string(), // agent product or framework
    model: z.string().optional(),
    harness: z.string().optional(),
    task: z.enum(['code', 'ops', 'research', 'sales', 'writing', 'data', 'other']),
    duration: z.string(),
    cost_usd: z.number().nonnegative(),
    outcome: z.enum(['landed', 'partial', 'aborted']),
    burns: z
      .array(
        z.object({
          what: z.string(),
          recovery: z.string(),
          cost_usd: z.number().nonnegative().default(0),
        }),
      )
      .default([]),
    lesson: z.string(),
    reins: z.object({
      scope: z.string(),
      budget: z.string(),
      kill_switch: z.string(),
      autonomy: z.string(),
    }),
    draft: z.boolean().default(false),
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
