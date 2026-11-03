// Nightly reconcile, called by the pipeline with the CRON_SECRET bearer:
// resync every claiming rider's claimed-flight mirror from Postgres, refresh
// their claims' handle snapshots, and recompute ranks (brief, Claim flow
// step 5: ranks from claimed flights, computed nightly).

import type { APIRoute } from 'astro';
import { recomputeRank } from '../../../lib/ranks';
import { flightlogConfigured, rpc } from '../../../lib/flightlog';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  const auth = request.headers.get('Authorization') ?? '';
  if (!env.CRON_SECRET || auth !== `Bearer ${env.CRON_SECRET}`) {
    return new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!flightlogConfigured(env)) return json(503, { error: 'flight log not configured' });

  const riders =
    (await rpc<{ rider_id: string; rider_handle: string; claimed: number }[]>(
      env, 'riders_with_claims', {},
    )) ?? [];

  let synced = 0;
  let promoted = 0;
  const now = new Date().toISOString();
  for (const r of riders) {
    const row = await env.DB.prepare(
      "SELECT handle FROM riders WHERE id = ? AND banned_at IS NULL",
    ).bind(r.rider_id).first<{ handle: string }>();
    if (!row) continue; // banned or deleted riders keep no live mirror
    await env.DB.prepare(
      `INSERT INTO rider_claimed_flights (rider_id, claimed, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (rider_id) DO UPDATE SET claimed = excluded.claimed, updated_at = excluded.updated_at`,
    ).bind(r.rider_id, Number(r.claimed), now).run();
    // Handle snapshot drift (renames) — fixed up in the corpus.
    if (row.handle && row.handle !== r.rider_handle) {
      await rpc(env, 'sync_rider_handle', { p_rider_id: r.rider_id, p_handle: row.handle });
    }
    const result = await recomputeRank(env.DB, r.rider_id, 'system', 'flightlog_nightly');
    if (result.changed) promoted++;
    synced++;
  }
  return json(200, { ok: true, riders: riders.length, synced, rankChanges: promoted });
};
