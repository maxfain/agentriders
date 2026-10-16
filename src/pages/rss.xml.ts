import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE } from '../lib/seo';

// Everything worth following, newest first: published flight logs and the
// Field Manual chapters that have a body. Prerendered, like /logs.json;
// Base.astro advertises it on every page.
const hasBody = (body: string | undefined) =>
  !!body && body.replace(/<!--[\s\S]*?-->/g, '').trim().length > 0;

export const GET: APIRoute = async () => {
  const logs = await getCollection('logs', ({ data }) => !data.draft);
  const chapters = (await getCollection('manual', ({ data }) => !data.draft)).filter((c) => hasBody(c.body));

  const items = [
    ...logs.map((log) => ({
      title: log.data.title,
      description: log.data.lesson,
      link: `/logs/${log.id}/`,
      pubDate: log.data.date,
      categories: ['Flight Logs', log.data.mount],
    })),
    ...chapters.map((chapter) => ({
      title: chapter.data.title,
      description: chapter.data.description,
      link: `/manual/${chapter.id}/`,
      pubDate: chapter.data.published,
      categories: ['Field Manual'],
    })),
  ].sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf());

  return rss({
    title: 'AgentRiders — Flight Logs & Field Manual',
    description: 'Real agent runs with the numbers left in, and the manual for holding the reins.',
    site: SITE,
    items,
    customData: '<language>en</language>',
  });
};
