import type { APIRoute } from 'astro';

export const prerender = false;

// Public, cacheable snapshot the static build reads to decide which log
// `rider` strings are real claimed handles (→ profile links), which logs
// carry a verified flight record (→ Verified badge), and which rider
// profiles have a published flight (→ sitemap entries). Kept tiny and
// side-effect free. Verified is wired here but only fills once the CLI
// (M4) starts matching records to logs.
export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;

  const handleRows = await env.DB.prepare(
    "SELECT handle FROM riders WHERE handle NOT LIKE 'pending-%' AND banned_at IS NULL",
  ).all<{ handle: string }>();

  const verifiedRows = await env.DB.prepare(
    `SELECT DISTINCT fr.matched_log_slug AS matched_log_slug
     FROM flight_records fr JOIN riders r ON r.id = fr.rider_id
     WHERE fr.matched_log_slug IS NOT NULL AND r.banned_at IS NULL`,
  ).all<{ matched_log_slug: string }>();

  // Profiles are indexable from the first published flight; `updated` is
  // the newest publish, the last time the profile changed for a crawler.
  const profileRows = await env.DB.prepare(
    `SELECT r.handle AS handle, COUNT(p.slug) AS flights, MAX(p.published_at) AS updated
     FROM riders r JOIN published_logs p ON p.rider_id = r.id
     WHERE r.banned_at IS NULL AND r.handle NOT LIKE 'pending-%'
     GROUP BY r.id ORDER BY r.handle`,
  ).all<{ handle: string; flights: number; updated: string }>();

  const verified: Record<string, true> = {};
  for (const r of verifiedRows.results ?? []) verified[r.matched_log_slug] = true;

  const body = {
    handles: (handleRows.results ?? []).map((r) => r.handle),
    verified,
    profiles: (profileRows.results ?? []).map((r) => ({
      handle: r.handle,
      flights: r.flights,
      updated: r.updated,
    })),
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
