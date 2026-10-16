// agentriders_draft_flight_log — PURE / LOCAL. Sends nothing over the network.
// Grounds the log in real session telemetry when it can, prints the exact
// metadata-only payload, and marks every field it could not verify.

import fs from 'node:fs';
import { buildRecord } from '../../cli/lib/record.js';
import { discoverSession } from '../lib/discover.js';
import { suggestFromPayload } from '../lib/suggest.js';
import { toMarkdown } from '../lib/frontmatter.js';
import { slugify, isValidSlug, TASK_VALUES, OUTCOME_VALUES } from '../lib/slug.js';

const REINS_KEYS = ['scope', 'budget', 'kill_switch', 'autonomy'];

function todayIso() {
  // Build time is fine here — a draft with no telemetry dates to "now".
  return new Date().toISOString().slice(0, 10);
}

export function draftFlightLog(input = {}, { cliVersion = '0.1.0' } = {}) {
  const sessionPath = discoverSession(input.session_log_path);

  let payload = null;
  if (sessionPath) {
    try {
      payload = buildRecord(fs.readFileSync(sessionPath, 'utf8'), { cliVersion });
    } catch {
      payload = null; // unreadable/partial log → unverified path
    }
  }
  const verified = payload !== null;

  // Telemetry-grounded fields when we have a payload, else the agent's values.
  const tele = payload ? suggestFromPayload(payload) : {};
  const duration = (verified ? tele.duration : input.duration) || undefined;
  const model = (verified ? tele.model : input.model) || undefined;
  const harness = (verified ? tele.harness : input.harness) || 'Claude Code';
  const date = (verified ? tele.date : input.date) || todayIso();
  const mount = input.mount || 'Claude Code';

  const provenance = {
    duration: verified ? 'verified' : 'unverified',
    model: verified && model ? 'verified' : 'unverified',
    date: verified ? 'verified' : 'unverified',
    harness: verified ? 'verified' : 'rider-asserted',
    mount: 'rider-asserted',
    title: 'rider-asserted',
    task: 'rider-asserted',
    outcome: 'rider-asserted',
    cost_usd: 'rider-asserted',
    lesson: 'rider-asserted',
    reins: 'rider-asserted',
    burns: 'rider-asserted',
  };

  // --- Validation (advisory; the server's composerSchema is authoritative) ---
  const issues = [];
  if (!input.title || typeof input.title !== 'string') issues.push('title is required.');
  if (!TASK_VALUES.includes(input.task)) issues.push(`task must be one of: ${TASK_VALUES.join(', ')}.`);
  if (!OUTCOME_VALUES.includes(input.outcome)) issues.push(`outcome must be one of: ${OUTCOME_VALUES.join(', ')}.`);
  if (!input.lesson || typeof input.lesson !== 'string') issues.push('lesson is required.');
  if (!duration) issues.push('duration is required (no session telemetry found — pass one, or point to the session log).');
  // The cost rule (manual: "Logging a flight"): a measured amount, never 0-as-unchecked.
  if (!(typeof input.cost_usd === 'number' && Number.isFinite(input.cost_usd) && input.cost_usd > 0)) {
    issues.push(
      'cost_usd must be a measured amount greater than 0. If you cannot measure it, put your best estimate and explain the uncertainty in the body — do not pass 0.',
    );
  }
  const reins = input.reins || {};
  for (const k of REINS_KEYS) {
    if (!reins[k] || typeof reins[k] !== 'string') issues.push(`reins.${k} is required.`);
  }

  // --- Assemble frontmatter (rider set server-side; draft:false on publish) ---
  const frontmatter = {
    title: input.title,
    date,
    mount,
    ...(model ? { model } : {}),
    harness,
    task: input.task,
    duration,
    cost_usd: input.cost_usd,
    outcome: input.outcome,
    burns: Array.isArray(input.burns)
      ? input.burns.map((b) => ({ what: b.what, recovery: b.recovery, cost_usd: Number(b.cost_usd) || 0 }))
      : [],
    lesson: input.lesson,
    reins: { scope: reins.scope, budget: reins.budget, kill_switch: reins.kill_switch, autonomy: reins.autonomy },
  };

  const slug = input.slug && isValidSlug(input.slug) ? input.slug : slugify(input.title || '');
  const markdown = toMarkdown(frontmatter, input.body || '');

  const riderAsserted = Object.keys(provenance).filter((k) => provenance[k] !== 'verified');
  const instruction = verified
    ? `Grounded in the session at ${sessionPath}. Before filing, restate these UNVERIFIED / rider-asserted fields to the user as your own claims, not facts: ${riderAsserted.join(', ')}. A confident closing message is not evidence the work landed.`
    : `No session telemetry was found, so NOTHING here is verified — every field is your own claim. Restate them to the user as unverified before filing, and remember: a confident closing message is not evidence the work landed.`;

  return {
    slug,
    markdown,
    provenance,
    egress_payload: payload, // metadata-only (counts/models/timestamps/evals), or null
    verifiable: verified,
    validation: issues.length ? { issues } : 'ok',
    session_path: sessionPath,
    agent_instruction: instruction,
  };
}
