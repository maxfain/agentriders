// Publish (brief, Pipeline step 8): recompute index_ok in SQL, spot-check a
// random sample of would-be-indexed flights, refresh the aggregate views the
// repo/agent pages read, and render OG cards for newly indexed flights.
//
// Spot check: 30 random indexed flights re-validated against the stored
// record — the debrief must still pass the validator, the reviewer excerpt
// must be ≤25 words with a github.com URL, and the numbers must be sane.
// Every flight that fails is dropped back out of the index (debrief cleared,
// gate recomputed); the rest stays live. The job only FAILS (to page the
// owner) when the failure count clears SPOT_CHECK_FAIL_THRESHOLD — a single
// blemish is routine residue and would otherwise page every day. The verify
// job (jobs/verify.ts) runs the same check over every indexed flight to keep
// that residue low. The printed URLs are the by-hand sample the brief requires
// before trusting a publish.

import type { Db } from '../db.ts';
import { AGENT_LABELS } from '../agents.ts';
import { CHECK_COLUMNS, type CheckRow, flightReasons } from '../debrief-check.ts';
import { refreshCorpusViews } from '../views.ts';
import { flightCard } from '../og.ts';
import { ensureBucket, uploadPng } from '../storage.ts';
import { startRun, finishRun } from '../runlog.ts';

// Every flight the spot-check catches is dropped from the index regardless;
// this only decides when to FAIL the publish and page the owner. One or two bad
// debriefs in a 30-row sample is routine residue (the verify job keeps it low)
// — failing on that would page daily and train the owner to ignore it — so page
// only on a cluster, which signals a systemic debrief regression.
const SPOT_CHECK_FAIL_THRESHOLD = 4; // of the 30-row sample (~13%)

export async function publish(db: Db, opts: { skipOg?: boolean; ogLimit?: number } = {}): Promise<void> {
  const run = await startRun(db, 'publish');
  try {
    const changed = await db.query<{ recompute_index_ok: number }>('select recompute_index_ok()');
    const indexed = await db.query<{ n: number }>(
      'select count(*)::integer as n from flights where index_ok',
    );

    const failures = await spotCheck(db);
    if (failures.length > 0) {
      for (const id of failures) {
        await db.query(
          'update flights set debrief = null, debrief_failed_at = now() where id = $1',
          [id],
        );
      }
      await db.query('select recompute_index_ok()');
    }

    // Keep planner statistics in step with the gate. recompute_index_ok() just
    // flipped index_ok on up to tens of thousands of rows; without fresh stats
    // the planner assumes ~0 indexed rows and picks disastrous plans for every
    // `where index_ok` reader (sitemap_pages, the author queries, the
    // mv_corpus_repos refresh below). A few seconds here saves seconds on every
    // later request. autoanalyze will not do this in time — a publish changes
    // far fewer rows than its 10% threshold.
    await db.query('analyze flights');

    await refreshCorpusViews(db);

    let ogRendered = 0;
    // Render every pending card by default — a backfill publish must not stop
    // 2k cards in and leave the rest without og:image. Pass ogLimit to cap it.
    if (!opts.skipOg) ogRendered = await renderOgCards(db, opts.ogLimit ?? 1_000_000);

    const blocked = failures.length >= SPOT_CHECK_FAIL_THRESHOLD;
    await finishRun(db, run, {
      ok: !blocked,
      rowsIn: Number(indexed[0].n),
      rowsOut: Number(changed[0].recompute_index_ok),
      errors: failures.length,
      errorSample:
        failures.length > 0
          ? `spot check dropped ${failures.length} flight(s)${blocked ? ' — over threshold' : ''}: ${failures.join(', ')}`
          : undefined,
      meta: { indexed: Number(indexed[0].n), ogRendered, spotCheckDropped: failures.length },
    });
    if (blocked) {
      throw new Error(
        `spot check failed for ${failures.length} flight(s) — exceeds threshold of ${SPOT_CHECK_FAIL_THRESHOLD}`,
      );
    }
  } catch (error) {
    if (!String(error).includes('spot check failed')) {
      await finishRun(db, run, { ok: false, errors: 1, errorSample: String(error) });
    }
    throw error;
  }
}

async function spotCheck(db: Db, sample = 30): Promise<number[]> {
  const rows = await db.query<CheckRow>(
    `select ${CHECK_COLUMNS}
     from flights f join repos r on r.id = f.repo_id
     where f.index_ok
     order by random() limit $1`,
    [sample],
  );
  const failures: number[] = [];
  console.log(`  spot check: ${rows.length} randomly sampled indexed flights`);
  for (const row of rows) {
    const reasons = flightReasons(row);
    const url = `https://agentriders.com/logs/${row.owner}/${row.name}/${row.number}/`;
    if (reasons.length > 0) {
      failures.push(row.id);
      console.log(`  FAIL ${url} — ${reasons.join('; ')}`);
    } else {
      console.log(`  ok   ${url}`);
    }
  }
  return failures;
}

async function renderOgCards(db: Db, limit: number): Promise<number> {
  await ensureBucket();
  const rows = await db.query<{
    id: number; title: string; owner: string; name: string; full_name: string;
    number: number; agent: string; outcome: string | null; additions: number | null;
    deletions: number | null; files_changed: number | null; hours_to_merge: number | null;
  }>(
    `select f.id, f.title, r.owner, r.name, r.full_name, f.number, f.agent, f.outcome,
            f.additions, f.deletions, f.files_changed, f.hours_to_merge
     from flights f join repos r on r.id = f.repo_id
     where f.index_ok and f.og_generated_at is null
     order by f.opened_at desc nulls last
     limit $1`,
    [limit],
  );
  let rendered = 0;
  for (const row of rows) {
    try {
      const png = await flightCard({
        title: row.title,
        repo: row.full_name,
        number: Number(row.number),
        agentLabel: AGENT_LABELS[row.agent] ?? row.agent,
        outcome: row.outcome,
        additions: n(row.additions),
        deletions: n(row.deletions),
        filesChanged: n(row.files_changed),
        hoursToMerge: n(row.hours_to_merge),
      });
      await uploadPng(`flights/${row.owner}/${row.name}/${row.number}.png`, png);
      await db.query('update flights set og_generated_at = now() where id = $1', [row.id]);
      rendered++;
      if (rendered % 200 === 0) console.log(`  og cards ${rendered}/${rows.length}`);
    } catch (error) {
      console.log(`  og card failed for flight ${row.id}: ${String(error).slice(0, 200)}`);
    }
  }
  return rendered;
}

function n(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}
