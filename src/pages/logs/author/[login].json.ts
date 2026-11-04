// The author page as JSON — the same record the page renders, machine-readable
// (listed in /llms.txt). Its own route so /logs/author/x.json never lands in the
// repo-JSON branch of /logs/[...corpus].
import type { APIRoute } from 'astro';
import { flightlogConfigured, rpc, validOwner, type AuthorPage } from '../../../lib/flightlog';

export const prerender = false;

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload, null, 1), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? 'public, max-age=60, s-maxage=300' : 'no-store',
      ...(status !== 200 ? { 'X-Robots-Tag': 'noindex' } : {}),
    },
  });

export const GET: APIRoute = async ({ params, locals }) => {
  const { env } = locals.runtime;
  const login = (params.login ?? '').toLowerCase();
  if (!validOwner(login) || !flightlogConfigured(env)) return new Response(null, { status: 404 });
  let data: AuthorPage | null = null;
  try {
    data = await rpc<AuthorPage>(env, 'author_page', { p_login: login });
  } catch {
    return new Response(null, { status: 404 });
  }
  if (!data) return new Response(null, { status: 404 });
  if (data.gone) return json({ error: 'gone', message: 'Removed at the request of its author.' }, 410);
  const { author, totals, agents, repos, flights, claim } = data;
  return json({
    author: { ...author, github_profile: `https://github.com/${author.login}` },
    totals, agents, repos, flights,
    claim: claim && { rider_handle: claim.rider_handle, rider_page: `https://agentriders.com/riders/${claim.rider_handle}/` },
    page: `https://agentriders.com/logs/author/${login}/`,
  });
};
