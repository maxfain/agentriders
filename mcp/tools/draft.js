// agentriders_draft_flight_log — PURE / LOCAL. Sends nothing over the network.
// Grounds the log in real session telemetry when it can, prints the exact
// metadata-only payload, and marks every field it could not verify.

import fs from 'node:fs';
import path from 'node:path';
import { buildRecord } from '../../cli/lib/record.js';
import { discoverSession } from '../lib/discover.js';
import { suggestFromPayload } from '../lib/suggest.js';
import { toMarkdown } from '../lib/frontmatter.js';
import { validateComposer } from '../lib/validate.js';
import { slugify, isValidSlug } from '../lib/slug.js';

function todayIso() {
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
  const reins = input.reins || {};

  // Provenance: only fields the signed telemetry actually attests are
  // "verified". harness/mount are assumptions, not telemetry, so they are
  // rider-asserted even on the verified path (a non-Claude-Code .jsonl that
  // happens to parse would otherwise be mislabelled).
  const provenance = {
    duration: verified ? 'verified' : 'unverified',
    model: verified && model ? 'verified' : 'unverified',
    date: verified ? 'verified' : 'unverified',
    harness: 'rider-asserted',
    mount: 'rider-asserted',
    title: 'rider-asserted',
    task: 'rider-asserted',
    outcome: 'rider-asserted',
    cost_usd: 'rider-asserted',
    lesson: 'rider-asserted',
    reins: 'rider-asserted',
    burns: 'rider-asserted',
  };

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

  // Advisory validation — the same bounds file() refuses on and the server
  // enforces authoritatively, so a confirmed file() won't fail late.
  const { issues } = validateComposer(frontmatter);

  const slug = input.slug && isValidSlug(input.slug) ? input.slug : slugify(input.title || '');
  const markdown = toMarkdown(frontmatter, input.body || '');
  const sessionName = sessionPath ? path.basename(sessionPath) : null;

  const riderAsserted = Object.keys(provenance).filter((k) => provenance[k] !== 'verified');
  const instruction = verified
    ? `Grounded in the discovered session (${sessionName}). Before filing, restate these UNVERIFIED / rider-asserted fields to the user as your own claims, not facts: ${riderAsserted.join(', ')}. A confident closing message is not evidence the work landed.`
    : `No session telemetry was found, so NOTHING here is verified — every field is your own claim. Restate them to the user as unverified before filing, and remember: a confident closing message is not evidence the work landed.`;

  return {
    slug,
    markdown,
    provenance,
    egress_payload: payload, // metadata-only (counts/models/timestamps/evals), or null
    verifiable: verified,
    validation: issues.length ? { issues } : 'ok',
    session_name: sessionName, // basename only — no directory/username in the transcript
    agent_instruction: instruction,
  };
}
