// Debriefs for gated flights only (brief, Pipeline step 7): the quality gate
// minus the debrief condition itself. Cached by (flight, prompt version);
// a prompt-version bump revalidates stored debriefs and regenerates only the
// ones that now fail. A validation failure never blocks publish — the flight
// simply renders without a debrief and stays out of the index.

import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { PostHog } from 'posthog-node';
import type { Db } from '../db.ts';
import { AGENT_LABELS } from '../agents.ts';
import {
  DEBRIEF_PROMPT_VERSION,
  buildDebriefPrompt,
  generateDebrief,
  validateDebrief,
  type DebriefRecord,
} from '../debrief.ts';
import { startRun, finishRun } from '../runlog.ts';

// The gate conditions that do not depend on the debrief itself.
export const GATED_SQL = `
  select f.id, f.title, f.body_excerpt, f.agent, r.full_name as repo, f.task_type,
         f.outcome, f.state, f.additions, f.deletions, f.files_changed, f.commits,
         f.review_count, f.change_requests, f.review_comment_count, f.hours_to_merge,
         f.reviewer_excerpt, f.debrief, f.debrief_prompt_version
  from flights f
  join repos r on r.id = f.repo_id
  join authors a on a.id = f.author_id
  left join claims c on c.flight_id = f.id
  where f.confidence in ('high','medium','dataset')
    and coalesce(r.stars, 0) >= 100
    and r.is_fork is not true and r.excluded is not true
    and a.opted_out is not true
    and (c.flight_id is null or c.visibility = 'public')
    and ((coalesce(f.additions,0) + coalesce(f.deletions,0)) >= 20
           and coalesce(f.files_changed,0) >= 1
         or coalesce(f.human_review_count,0) >= 1)
    and f.outcome in ('merged_clean','merged_after_rework','burn')
    and (f.debrief is null and f.debrief_failed_at is null
         or f.debrief_prompt_version is distinct from $1)
  order by f.id
  limit $2`;

type Row = DebriefRecord & { id: number; agent: string; debrief: string | null; debrief_prompt_version: string | null };

export async function debriefJob(
  db: Db,
  opts: { limit?: number; dryRun?: boolean; client?: Anthropic; concurrency?: number } = {},
): Promise<void> {
  const run = await startRun(db, 'debrief', { promptVersion: DEBRIEF_PROMPT_VERSION });
  let written = 0;
  let failed = 0;
  let revalidated = 0;
  let errorSample: string | undefined;
  let posthog: PostHog | undefined;
  try {
    // No --limit means "every gated flight", not a silent cap — the backfill
    // must not quietly stop 5k in. The daily job passes its own small limit.
    const rows = await db.query<Row>(GATED_SQL, [DEBRIEF_PROMPT_VERSION, opts.limit ?? 1_000_000]);
    if (opts.dryRun) {
      const first = rows[0];
      if (first) console.log(JSON.stringify(buildDebriefPrompt(toRecord(first)), null, 2));
      console.log(`${rows.length} flights need a debrief (dry run — nothing written)`);
      await finishRun(db, run, { ok: true, rowsIn: rows.length, rowsOut: 0 });
      return;
    }
    const projectToken = process.env.POSTHOG_PROJECT_TOKEN;
    const host = process.env.POSTHOG_HOST;
    if (projectToken && host) {
      posthog = new PostHog(projectToken, { host });
    } else if (process.env.NODE_ENV !== 'production') {
      if (!projectToken) {
        console.warn('POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_PROJECT_TOKEN is configured');
      }
      if (!host) {
        console.warn('POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_HOST is configured');
      }
    }
    const client = opts.client ?? new Anthropic();
    const sessionId = `pipeline-debrief-${run.id}`;

    // Prompt-version bump: revalidate existing debriefs first; only failures
    // regenerate (brief: "A prompt change re-runs validation across all
    // debriefs; failing ones are regenerated").
    const toGenerate: Row[] = [];
    for (const row of rows) {
      if (row.debrief && row.debrief_prompt_version !== DEBRIEF_PROMPT_VERSION) {
        const verdict = validateDebrief(row.debrief, toRecord(row));
        if (verdict.ok) {
          await db.query('update flights set debrief_prompt_version = $2 where id = $1', [
            row.id,
            DEBRIEF_PROMPT_VERSION,
          ]);
          revalidated++;
          continue;
        }
      }
      toGenerate.push(row);
    }

    const concurrency = opts.concurrency ?? 4;
    let next = 0;
    const worker = async () => {
      for (;;) {
        const index = next++;
        if (index >= toGenerate.length) return;
        const row = toGenerate[index];
        try {
          const result = await generateDebrief(
            client,
            toRecord(row),
            undefined,
            posthog ? { posthog, sessionId, traceId: randomUUID() } : undefined,
          );
          if (result.ok) {
            await db.query(
              `update flights set debrief = $2, debrief_prompt_version = $3,
                 debrief_failed_at = null where id = $1`,
              [row.id, result.text, DEBRIEF_PROMPT_VERSION],
            );
            written++;
          } else {
            await db.query(
              `update flights set debrief = null, debrief_prompt_version = $2,
                 debrief_failed_at = now() where id = $1`,
              [row.id, DEBRIEF_PROMPT_VERSION],
            );
            failed++;
            errorSample ??= result.reasons.join('; ');
          }
        } catch (error) {
          failed++;
          errorSample ??= String(error);
        }
        const done = written + failed;
        if (done % 100 === 0) console.log(`  debriefs ${done}/${toGenerate.length}`);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));

    const failureRate = written + failed > 0 ? failed / (written + failed) : 0;
    await finishRun(db, run, {
      ok: true,
      rowsIn: rows.length,
      rowsOut: written,
      errors: failed,
      errorSample,
      meta: { revalidated, failureRate: Math.round(failureRate * 1000) / 1000 },
    });
    // Alert hook (brief, Monitoring): debrief failure rate past 5%.
    if (written + failed >= 20 && failureRate > 0.05) {
      throw new Error(`debrief failure rate ${(failureRate * 100).toFixed(1)}% exceeds 5%`);
    }
  } catch (error) {
    if (!String(error).includes('failure rate')) {
      await finishRun(db, run, { ok: false, rowsOut: written, errors: failed + 1, errorSample: String(error) });
    }
    throw error;
  } finally {
    if (posthog) await posthog.shutdown(3000).catch(() => {});
  }
}

function toRecord(row: Row): DebriefRecord {
  return {
    title: row.title,
    body_excerpt: row.body_excerpt,
    agent_label: AGENT_LABELS[row.agent] ?? row.agent,
    repo: row.repo,
    task_type: row.task_type,
    outcome: row.outcome as string,
    state: row.state,
    additions: numOrNull(row.additions),
    deletions: numOrNull(row.deletions),
    files_changed: numOrNull(row.files_changed),
    commits: numOrNull(row.commits),
    review_count: numOrNull(row.review_count),
    change_requests: numOrNull(row.change_requests),
    review_comment_count: numOrNull(row.review_comment_count),
    hours_to_merge: numOrNull(row.hours_to_merge),
    reviewer_excerpt: row.reviewer_excerpt,
  };
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
