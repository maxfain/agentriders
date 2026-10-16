// Shared composer validation — a plain-JS mirror of the bounds in
// src/lib/log-schema.ts, used by BOTH draft (advisory issues) and file (which
// refuses to upload when it fails). The server's composerSchema is still
// authoritative; this just stops a confirmed file() from failing late with a
// server 400, and enforces the MCP's stricter measured-cost rule.
//
// Pinned to the real schema by tests/mcp-draft.test.ts (same inputs → the
// server's composerSchema agrees).

import { TASK_VALUES, OUTCOME_VALUES } from './slug.js';

const isStr = (v) => typeof v === 'string';
const inRange = (v, min, max) => isStr(v) && v.length >= min && v.length <= max;

function isRealDate(s) {
  if (!isStr(s) || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Validate an assembled flight-log frontmatter object (composer fields).
 * Returns { issues: string[] } — empty means valid.
 */
export function validateComposer(fm = {}) {
  const issues = [];
  if (!inRange(fm.title, 1, 140)) issues.push('title is required (1–140 chars).');
  if (!isRealDate(fm.date)) issues.push('date must be a real calendar date, yyyy-mm-dd.');
  if (!inRange(fm.mount, 1, 80)) issues.push('mount is required (1–80 chars).');
  if (fm.model != null && !inRange(fm.model, 0, 80)) issues.push('model must be ≤80 chars.');
  if (fm.harness != null && !inRange(fm.harness, 0, 80)) issues.push('harness must be ≤80 chars.');
  if (!TASK_VALUES.includes(fm.task)) issues.push(`task must be one of: ${TASK_VALUES.join(', ')}.`);
  if (!inRange(fm.duration, 1, 40)) issues.push('duration is required (1–40 chars) — pass one, or point to the session log.');
  if (!(typeof fm.cost_usd === 'number' && Number.isFinite(fm.cost_usd) && fm.cost_usd > 0)) {
    issues.push(
      'cost_usd must be a measured amount greater than 0. If you cannot measure it, put your best estimate and explain the uncertainty in the body — do not pass 0.',
    );
  }
  if (!OUTCOME_VALUES.includes(fm.outcome)) issues.push(`outcome must be one of: ${OUTCOME_VALUES.join(', ')}.`);
  if (!inRange(fm.lesson, 1, 500)) issues.push('lesson is required (1–500 chars).');

  const r = fm.reins || {};
  if (!inRange(r.scope, 1, 280)) issues.push('reins.scope is required (1–280 chars).');
  if (!inRange(r.budget, 1, 120)) issues.push('reins.budget is required (1–120 chars).');
  if (!inRange(r.kill_switch, 1, 120)) issues.push('reins.kill_switch is required (1–120 chars).');
  if (!inRange(r.autonomy, 1, 120)) issues.push('reins.autonomy is required (1–120 chars).');

  const burns = fm.burns;
  if (burns != null) {
    if (!Array.isArray(burns) || burns.length > 20) issues.push('burns must be an array of at most 20 entries.');
    else
      for (const b of burns) {
        if (!inRange(b?.what, 1, 280) || !inRange(b?.recovery, 1, 280)) {
          issues.push('each burn needs what (1–280) and recovery (1–280).');
          break;
        }
      }
  }
  return { issues };
}
