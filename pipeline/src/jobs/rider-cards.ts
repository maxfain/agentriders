// Rider share cards (brief, Claim flow step 4): handle, rank, flights, merge
// rate, burns survived, agents flown. Stats come from claims⋈flights in
// Postgres; the rank is public information read from the site's profile JSON
// (D1 stays the system of record for people). Runs nightly after claims.

import type { Db } from '../db.ts';
import { AGENT_LABELS } from '../agents.ts';
import { riderCard } from '../og.ts';
import { ensureBucket, uploadPng } from '../storage.ts';
import { optional } from '../env.ts';
import { startRun, finishRun } from '../runlog.ts';

type RiderStats = {
  rider_id: string;
  handle: string;
  flights: number;
  merged: number;
  decided: number;
  burns: number;
  agents: string[];
};

export async function riderCards(db: Db): Promise<void> {
  const run = await startRun(db, 'rider-cards');
  const site = optional('SITE_ORIGIN', 'https://agentriders.com').replace(/\/$/, '');
  let rendered = 0;
  let errors = 0;
  let errorSample: string | undefined;
  try {
    await ensureBucket();
    const riders = await db.query<RiderStats>(
      `select c.rider_id, max(c.rider_handle) as handle,
              count(*)::integer as flights,
              count(*) filter (where f.state = 'merged')::integer as merged,
              count(*) filter (where f.state <> 'open')::integer as decided,
              count(*) filter (where f.outcome = 'burn')::integer as burns,
              array_agg(distinct f.agent) as agents
       from claims c join flights f on f.id = c.flight_id
       group by c.rider_id`,
    );
    for (const r of riders) {
      try {
        // Rank from the public profile JSON; a miss renders the card unranked.
        let rank: string | null = null;
        try {
          const res = await fetch(`${site}/api/public/rider/${r.handle}.json`, {
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) rank = ((await res.json()) as { rank?: string | null }).rank ?? null;
        } catch {
          /* unranked card */
        }
        const agents = (Array.isArray(r.agents) ? r.agents : parsePgArray(String(r.agents)))
          .map((a) => AGENT_LABELS[a] ?? a);
        const png = await riderCard({
          handle: r.handle,
          rank,
          flights: Number(r.flights),
          mergeRate: Number(r.decided) > 0 ? Number(r.merged) / Number(r.decided) : null,
          burnsSurvived: Number(r.burns),
          agents,
        });
        await uploadPng(`riders/${r.handle}.png`, png);
        rendered++;
      } catch (error) {
        errors++;
        errorSample ??= String(error);
      }
    }
    await finishRun(db, run, { ok: true, rowsIn: riders.length, rowsOut: rendered, errors, errorSample });
  } catch (error) {
    await finishRun(db, run, { ok: false, rowsOut: rendered, errors: errors + 1, errorSample: String(error) });
    throw error;
  }
}

function parsePgArray(value: string): string[] {
  return value.replace(/^\{|\}$/g, '').split(',').filter(Boolean);
}
