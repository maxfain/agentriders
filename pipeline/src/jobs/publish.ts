// Publish (brief, Pipeline step 8): recompute index_ok in SQL, spot-check a
// random sample of would-be-indexed flights, refresh the aggregate views the
// repo/agent pages read, and render OG cards for newly indexed flights.
//
// Spot check: 30 random indexed flights re-validated against the stored
// record — the debrief must still pass the validator, the reviewer excerpt
// must be ≤25 words with a github.com URL, and the numbers must be sane.
// A failure drops those flights back out of the index (debrief cleared, gate
// recomputed) and fails the job so the owner is paged; the rest of the index
// stays live. The printed URLs are the by-hand sample (open 30, confirm
// against GitHub) the brief requires before trusting a publish.

import type { Db } from '../db.ts';
import { AGENT_LABELS } from '../agents.ts';
import { validateDebrief, type DebriefRecord } from '../debrief.ts';
import { flightCard } from '../og.ts';
import { ensureBucket, uploadPng } from '../storage.ts';
import { startRun, finishRun } from '../runlog.ts';

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

    await db.query('select refresh_corpus_views()');

    let ogRendered = 0;
    // Render every pending card by default — a backfill publish must not stop
    // 2k cards in and leave the rest without og:image. Pass ogLimit to cap it.
    if (!opts.skipOg) ogRendered = await renderOgCards(db, opts.ogLimit ?? 1_000_000);

    await finishRun(db, run, {
      ok: failures.length === 0,
      rowsIn: Number(indexed[0].n),
      rowsOut: Number(changed[0].recompute_index_ok),
      errors: failures.length,
      errorSample: failures.length > 0 ? `spot check failed for flights ${failures.join(', ')}` : undefined,
      meta: { indexed: Number(indexed[0].n), ogRendered },
    });
    if (failures.length > 0) {
      throw new Error(`spot check failed for ${failures.length} flight(s) — publish blocked for them`);
    }
  } catch (error) {
    if (!String(error).includes('spot check failed')) {
      await finishRun(db, run, { ok: false, errors: 1, errorSample: String(error) });
    }
    throw error;
  }
}

type CheckRow = DebriefRecord & {
  id: number;
  agent: string;
  number: number;
  owner: string;
  name: string;
  debrief: string;
  reviewer_excerpt_url: string | null;
};

async function spotCheck(db: Db, sample = 30): Promise<number[]> {
  const rows = await db.query<CheckRow>(
    `select f.id, f.title, f.body_excerpt, f.agent, r.full_name as repo, r.owner, r.name,
            f.number, f.task_type, f.outcome, f.state, f.additions, f.deletions,
            f.files_changed, f.commits, f.review_count, f.change_requests,
            f.review_comment_count, f.hours_to_merge, f.reviewer_excerpt,
            f.reviewer_excerpt_url, f.debrief
     from flights f join repos r on r.id = f.repo_id
     where f.index_ok
     order by random() limit $1`,
    [sample],
  );
  const failures: number[] = [];
  console.log(`  spot check: ${rows.length} randomly sampled indexed flights`);
  for (const row of rows) {
    const reasons: string[] = [];
    const record: DebriefRecord = {
      ...row,
      agent_label: AGENT_LABELS[row.agent] ?? row.agent,
      additions: n(row.additions),
      deletions: n(row.deletions),
      files_changed: n(row.files_changed),
      commits: n(row.commits),
      review_count: n(row.review_count),
      change_requests: n(row.change_requests),
      review_comment_count: n(row.review_comment_count),
      hours_to_merge: n(row.hours_to_merge),
    };
    const verdict = validateDebrief(row.debrief, record);
    if (!verdict.ok) reasons.push(...verdict.reasons);
    if (row.reviewer_excerpt) {
      if (row.reviewer_excerpt.trim().split(/\s+/).length > 25) reasons.push('excerpt over 25 words');
      if (row.reviewer_excerpt_url && !/^https:\/\/github\.com\//.test(row.reviewer_excerpt_url)) {
        reasons.push('excerpt URL not github.com');
      }
    }
    for (const field of ['additions', 'deletions', 'files_changed', 'commits'] as const) {
      const v = record[field];
      if (v !== null && v < 0) reasons.push(`${field} negative`);
    }
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
