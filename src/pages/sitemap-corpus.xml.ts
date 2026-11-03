// The corpus sitemap index: repo + agent pages and the index_ok flights in
// 10k chunks, served straight from Postgres. Referenced from robots.txt next
// to the static site's own sitemap-index.xml. Pages that drop out of
// index_ok leave the sitemap but keep answering with noindex, not 404, so
// claimed links keep working (brief, Quality).
import type { APIRoute } from 'astro';
import { flightlogConfigured, rpc } from '../lib/flightlog';

export const prerender = false;
const SITE = 'https://agentriders.com';

export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;
  if (!flightlogConfigured(env)) return new Response(null, { status: 404 });
  const summary = await rpc<{ flight_chunks: number; flights: number; lastmod: string }>(
    env, 'sitemap_summary', {},
  );
  const chunks = summary?.flight_chunks ?? 0;
  const lastmod = summary?.lastmod ?? new Date().toISOString();
  const sitemaps = [
    `${SITE}/sitemaps/corpus-pages.xml`,
    ...Array.from({ length: chunks }, (_, i) => `${SITE}/sitemaps/flights-${i}.xml`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemaps
    .map((loc) => `  <sitemap><loc>${loc}</loc><lastmod>${lastmod}</lastmod></sitemap>`)
    .join('\n')}\n</sitemapindex>\n`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=3600' },
  });
};
