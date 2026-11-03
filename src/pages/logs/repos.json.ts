// The repo index: repositories with indexed flights, as JSON
// (listed in /llms.txt so agents reading the site skip the HTML).
import type { APIRoute } from 'astro';
import { flightlogConfigured, rpc } from '../../lib/flightlog';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;
  if (!flightlogConfigured(env)) return new Response(null, { status: 404 });
  const repos = (await rpc<unknown[]>(env, 'corpus_repos', { p_limit: 1000 })) ?? [];
  return new Response(
    JSON.stringify(
      {
        repos,
        pages: (repos as { full_name: string }[]).map((r) => `https://agentriders.com/logs/${r.full_name}/`),
      },
      null,
      1,
    ),
    { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=3600' } },
  );
};
