import type { APIRoute } from 'astro';

export const prerender = false;

// Public, cacheable snapshot the static build reads to decide which log
// `rider` strings are real claimed handles (→ profile links) and which logs
// carry a verified flight record (→ Verified badge). Kept tiny and
// side-effect free. Verified is wired here but only fills once the CLI
// (M4) starts matching records to logs.
export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;

  const handleRows = await env.DB.prepare(
    "SELECT handle FROM riders WHERE handle NOT LIKE 'pending-%' AND banned_at IS NULL",
  ).all<{ handle: string }>();

  const verifiedRows = await env.DB.prepare(
    'SELECT DISTINCT matched_log_slug FROM flight_records WHERE matched_log_slug IS NOT NULL',
  ).all<{ matched_log_slug: string }>();

  const verified: Record<string, true> = {};
  for (const r of verifiedRows.results ?? []) verified[r.matched_log_slug] = true;

  const body = {
    handles: (handleRows.results ?? []).map((r) => r.handle),
    verified,
  };
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
      // Short public cache: the build fetches this; freshness self-corrects
      // because every publish triggers a rebuild.
      'Cache-Control': 'public, max-age=60',
    },
  });
};
