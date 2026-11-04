// The author index: GitHub accounts with indexed flights — name as their
// profile shows it, flight counts, agents flown — with page URLs (listed in
// /llms.txt so agents reading the site skip the HTML).
import type { APIRoute } from 'astro';
import { flightlogConfigured, rpc } from '../../lib/flightlog';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;
  if (!flightlogConfigured(env)) return new Response(null, { status: 404 });
  const authors = (await rpc<{ login: string }[]>(env, 'corpus_authors', { p_limit: 1000 }).catch(() => null)) ?? [];
  return new Response(
    JSON.stringify(
      {
        authors,
        pages: authors.map((a) => `https://agentriders.com/logs/author/${a.login.toLowerCase()}/`),
      },
      null,
      1,
    ),
    { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=3600' } },
  );
};
