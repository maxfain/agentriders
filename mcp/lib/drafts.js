// In-memory store of the egress payloads this server built in
// agentriders_draft_flight_log. file() signs ONLY a payload looked up here by
// draft_id — never one passed in by the caller — so the signed "verified"
// record is always real session telemetry, not whatever the model composes.
// One stdio server lives per client session, so memory is the right scope.

import crypto from 'node:crypto';

const MAX_DRAFTS = 20;
const drafts = new Map();

/** Remember a draft's payload; returns its id. */
export function rememberDraft(payload) {
  const id = crypto.randomUUID();
  drafts.set(id, payload);
  if (drafts.size > MAX_DRAFTS) drafts.delete(drafts.keys().next().value);
  return id;
}

/** The payload for a draft id, or undefined when this server never built it. */
export function draftPayload(id) {
  return typeof id === 'string' ? drafts.get(id) : undefined;
}
