// The agent index: every agent with flights in the corpus, as JSON
// (listed in /llms.txt so agents reading the site skip the HTML).
import type { APIRoute } from 'astro';
import { flightlogConfigured, rpc } from '../../lib/flightlog';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;
  if (!flightlogConfigured(env)) return new Response(null, { status: 404 });
  const agents = (await rpc<unknown[]>(env, 'corpus_agents', {})) ?? [];
  return new Response(
    JSON.stringify(
      {
        agents,
        pages: (agents as { agent: string }[]).map((a) => `https://agentriders.com/logs/agent/${a.agent}/`),
      },
      null,
      1,
    ),
    { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=3600' } },
  );
};
