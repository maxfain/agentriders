// Machine-readable twin of the agent page: same record, same path + .json.
import type { APIRoute } from 'astro';
import { flightlogConfigured, isAgentSlug, rpc } from '../../../lib/flightlog';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const { env } = locals.runtime;
  const agent = (params.agent ?? '').toLowerCase();
  if (!isAgentSlug(agent) || !flightlogConfigured(env)) return new Response(null, { status: 404 });
  const data = await rpc(env, 'agent_page', { p_agent: agent });
  if (!data) return new Response(null, { status: 404 });
  return new Response(
    JSON.stringify({ ...data, page: `https://agentriders.com/logs/agent/${agent}/` }, null, 1),
    { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60, s-maxage=300' } },
  );
};
