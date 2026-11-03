// Daily GH Archive discovery (06:00 UTC for the previous day). Candidates
// land as pending_candidates rows on the flight itself: a minimal flight row
// (confidence from the discovery signal alone) that enrichment then fills.
// Closed/reopened actions for PRs we already track queue a state refresh by
// clearing enriched_at.

import type { Db } from '../db.ts';
import { bigquery, discoverySql } from '../bigquery.ts';
import { detectSignals } from '../agents.ts';
import { required } from '../env.ts';
import { startRun, finishRun } from '../runlog.ts';
import { pgTextArray } from './load-aidev.ts';

function yesterdayUTC(): string {
  const d = new Date(Date.now() - 86_400_000);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

export async function discover(db: Db, opts: { date?: string; dryRun?: boolean }): Promise<void> {
  const date = (opts.date ?? yesterdayUTC()).replace(/-/g, '');
  const sql = discoverySql(date);
  if (opts.dryRun) {
    console.log(sql);
    return;
  }
  const run = await startRun(db, 'discover', { date });
  try {
    const { rows, bytesProcessed } = await bigquery(required('BQ_SERVICE_ACCOUNT_JSON'), sql);
    let inserted = 0;
    let stateQueued = 0;
    let skipped = 0;

    for (const r of rows) {
      const repoFull = r.repo;
      const number = Number(r.number);
      if (!repoFull || !repoFull.includes('/') || !Number.isFinite(number)) {
        skipped++;
        continue;
      }
      const detection = detectSignals({
        authorLogin: r.login,
        headRef: r.head_ref,
        commitMessages: [],
        coAuthors: r.coauthor_push === 'true' ? ['agent-coauthor-push'] : [],
      });
      // A PR with no signal is not a flight. (A coauthor_push alone names no
      // agent yet — enrichment reads the commits and decides; store it as a
      // low-confidence unknown so enrichment picks it up.)
      const signals = detection?.signals ?? [];
      if (r.coauthor_push === 'true') signals.push('push:coauthor-trailer');
      if (signals.length === 0) {
        skipped++;
        continue;
      }

      if (r.action === 'opened') {
        const authorId = await upsertAuthor(db, r.login, r.user_id);
        const repoId = await upsertRepo(db, repoFull);
        if (authorId === null || repoId === null) {
          skipped++;
          continue;
        }
        const res = await db.query(
          `insert into flights (github_pr_id, repo_id, author_id, number, agent, signals,
                                confidence, state, opened_at, source)
           values ($1, $2, $3, $4, $5, $6::text[], $7, 'open', $8, 'gharchive')
           on conflict (repo_id, number) do nothing
           returning 1`,
          [
            r.pr_id ? Number(r.pr_id) : null,
            repoId,
            authorId,
            number,
            detection?.agent ?? 'unknown',
            pgTextArray(signals),
            detection?.confidence ?? 'low',
            r.created_at,
          ],
        );
        inserted += res.length;
      } else {
        // closed / reopened for a PR we may track: queue a re-enrichment.
        const res = await db.query(
          `update flights f set enriched_at = null
           from repos r
           where r.id = f.repo_id and r.full_name_lower = lower($1) and f.number = $2
           returning 1`,
          [repoFull, number],
        );
        stateQueued += res.length;
      }
    }

    await finishRun(db, run, {
      ok: true,
      rowsIn: rows.length,
      rowsOut: inserted,
      meta: { date, bytesProcessed, stateQueued, skipped },
    });
    // The alert hook: a zero-candidate day means the GH Archive table is late
    // or the query broke (brief, Monitoring) — fail the job so Actions alerts.
    if (rows.length === 0) {
      throw new Error(`discovery found zero candidates for ${date} — table late or query broken`);
    }
  } catch (error) {
    if (!String(error).includes('zero candidates')) {
      await finishRun(db, run, { ok: false, errors: 1, errorSample: String(error) });
    }
    throw error;
  }
}

async function upsertAuthor(db: Db, login: string | null, userId: string | null): Promise<number | null> {
  if (!login || !userId || !Number.isFinite(Number(userId))) return null;
  const rows = await db.query<{ id: number }>(
    `insert into authors (github_user_id, login, avatar_url, is_bot)
     values ($1, $2, $3, $4)
     on conflict (github_user_id) do update set login = excluded.login
     returning id`,
    [
      Number(userId),
      login,
      `https://avatars.githubusercontent.com/u/${Number(userId)}?v=4`,
      login.endsWith('[bot]') || login.toLowerCase() === 'copilot',
    ],
  );
  return rows.length > 0 ? Number(rows[0].id) : null;
}

async function upsertRepo(db: Db, fullName: string): Promise<number | null> {
  const rows = await db.query<{ id: number }>(
    `insert into repos (full_name) values ($1)
     on conflict (full_name_lower) do update set full_name = excluded.full_name
     returning id`,
    [fullName],
  );
  return rows.length > 0 ? Number(rows[0].id) : null;
}
