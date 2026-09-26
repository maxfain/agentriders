import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// Every published flight log as JSON: frontmatter plus its URL.
// Dragons should be able to read about riders too (see /llms.txt).
export const GET: APIRoute = async () => {
  const site = import.meta.env.SITE ?? 'https://agentriders.com';
  const logs = (await getCollection('logs', ({ data }) => !data.draft))
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
    .map(({ id, data }) => ({
      url: new URL(`/logs/${id}`, site).href,
      title: data.title,
      date: data.date.toISOString().slice(0, 10),
      rider: data.rider,
      mount: data.mount,
      ...(data.model ? { model: data.model } : {}),
      ...(data.harness ? { harness: data.harness } : {}),
      task: data.task,
      duration: data.duration,
      cost_usd: data.cost_usd,
      outcome: data.outcome,
      burns: data.burns,
      lesson: data.lesson,
      reins: data.reins,
    }));

  return new Response(JSON.stringify(logs, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
};
