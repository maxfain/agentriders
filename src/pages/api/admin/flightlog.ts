// Admin actions on the corpus (middleware already guarantees admin + cookie):
//   { action: "exclude-repo",   owner, repo, excluded }   repo takedown (48h promise)
//   { action: "opt-out-author", githubUserId, optedOut }  email opt-outs, verified
//     by a line in the author's GitHub profile bio (docs/flight-log-corpus.md)

import type { APIRoute } from 'astro';
import { flightlogConfigured, rpc, validOwner, validRepoName } from '../../../lib/flightlog';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  if (!flightlogConfigured(env)) return json(503, { error: 'The flight log is not configured yet.' });

  let body: { action?: string; owner?: string; repo?: string; excluded?: boolean; githubUserId?: number; optedOut?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json(400, { error: 'Send JSON.' });
  }

  if (body.action === 'exclude-repo') {
    const owner = (body.owner ?? '').trim();
    const repo = (body.repo ?? '').trim();
    if (!validOwner(owner) || !validRepoName(repo)) return json(400, { error: 'Bad owner/repo.' });
    const result = await rpc<{ ok: boolean; error?: string }>(env, 'exclude_repo', {
      p_owner: owner, p_repo: repo, p_excluded: body.excluded !== false,
    });
    if (!result?.ok) return json(404, { error: result?.error ?? 'No such repo.' });
    return json(200, { ok: true });
  }

  if (body.action === 'opt-out-author') {
    const id = Number(body.githubUserId);
    if (!Number.isInteger(id) || id < 1) return json(400, { error: 'Bad GitHub user id.' });
    const result = await rpc<{ ok: boolean }>(env, 'opt_out_author', {
      p_github_user_id: id, p_opted_out: body.optedOut !== false,
    });
    if (!result?.ok) return json(500, { error: 'Failed.' });
    return json(200, { ok: true });
  }

  return json(400, { error: 'Unknown action.' });
};
