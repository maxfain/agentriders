import type { APIRoute } from 'astro';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Trigger a Pages deploy via the configured hook — used to refresh static
// log pages (rider links, verified badges) between publishes.
export const POST: APIRoute = async ({ locals }) => {
  const hook = locals.runtime.env.PAGES_DEPLOY_HOOK;
  if (!hook) return json(503, { error: 'No deploy hook configured.' });
  try {
    const res = await fetch(hook, { method: 'POST' });
    if (!res.ok) return json(502, { error: `Deploy hook returned ${res.status}.` });
  } catch (error) {
    return json(502, { error: `Deploy hook failed: ${(error as Error).message}` });
  }
  return json(200, { ok: true });
};
