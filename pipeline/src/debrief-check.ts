// Re-validate a stored, already-indexed flight against its record — the shared
// check behind both the publish spot-check (a 30-row sample) and the verify job
// (every indexed flight). A row that returns any reason here would not pass the
// debrief gate today, so it should be dropped back out of the index.

import { validateDebrief, type DebriefRecord } from './debrief.ts';
import { AGENT_LABELS } from './agents.ts';

// The columns every per-flight check needs, as a SELECT fragment over
// `flights f join repos r on r.id = f.repo_id`.
export const CHECK_COLUMNS = `f.id, f.title, f.body_excerpt, f.agent, r.full_name as repo, r.owner, r.name,
       f.number, f.task_type, f.outcome, f.state, f.additions, f.deletions,
       f.files_changed, f.commits, f.review_count, f.change_requests,
       f.review_comment_count, f.hours_to_merge, f.reviewer_excerpt,
       f.reviewer_excerpt_url, f.debrief`;

export type CheckRow = DebriefRecord & {
  id: number;
  agent: string;
  number: number;
  owner: string;
  name: string;
  debrief: string;
  reviewer_excerpt_url: string | null;
};

function n(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

/** Every reason this indexed flight would fail re-validation (empty = ok). */
export function flightReasons(row: CheckRow): string[] {
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
  return reasons;
}
