// Corpus sitemap chunks: corpus-pages.xml (repo + agent pages) and
// flights-N.xml (index_ok flights, 10k per file, lastmod = enrichment time).
import type { APIRoute } from 'astro';
import { flightlogConfigured, rpc } from '../../lib/flightlog';

export const prerender = false;
const SITE = 'https://agentriders.com';

type Row = { loc: string; lastmod: string | null };

function urlset(rows: Row[]): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows
    .map((r) => {
      const loc = `${SITE}${r.loc.split('/').map((s) => encodeURIComponent(s)).join('/')}`;
      return `  <url><loc>${loc}</loc>${r.lastmod ? `<lastmod>${r.lastmod}</lastmod>` : ''}</url>`;
    })
    .join('\n')}\n</urlset>\n`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=3600' },
  });
}

export const GET: APIRoute = async ({ params, locals }) => {
  const { env } = locals.runtime;
  if (!flightlogConfigured(env)) return new Response(null, { status: 404 });
  const chunk = params.chunk ?? '';
  if (chunk === 'corpus-pages') {
    const rows = (await rpc<Row[]>(env, 'sitemap_pages', {})) ?? [];
    return urlset(rows);
  }
  const m = chunk.match(/^flights-(\d{1,4})$/);
  if (!m) return new Response(null, { status: 404 });
  const rows = (await rpc<Row[]>(env, 'sitemap_flights', { p_chunk: Number(m[1]) })) ?? [];
  if (rows.length === 0 && Number(m[1]) > 0) return new Response(null, { status: 404 });
  return urlset(rows);
};
