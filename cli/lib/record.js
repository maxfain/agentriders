// Build a flight record from a Claude Code session log.
//
// The payload is METADATA ONLY — counts, model names, timestamps, a one-way
// session hash, and the eval signals from eval-detector. It never contains
// prompts, code, file contents, file paths, or command text. What you see
// printed by `agentriders log` is exactly what the object below carries.

import crypto from 'node:crypto';
import { detectEvals } from '../eval-detector.js';

const sha256Hex = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

/**
 * Parse the raw session JSONL into the facts we publish. Returns:
 *   { sessionId, times:[iso...], models:Set, toolCounts:{name:n} }
 * Malformed lines are skipped.
 */
function scanSession(jsonl) {
  let sessionId = null;
  const times = [];
  const models = new Set();
  const toolCounts = {};
  for (const line of String(jsonl).split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!sessionId && typeof entry.sessionId === 'string' && entry.sessionId) sessionId = entry.sessionId;
    if (typeof entry.timestamp === 'string' && !Number.isNaN(Date.parse(entry.timestamp))) {
      times.push(entry.timestamp);
    }
    const msg = entry.message;
    if (msg && typeof msg === 'object') {
      if (typeof msg.model === 'string' && msg.model) models.add(msg.model);
      const blocks = Array.isArray(msg.content) ? msg.content : [];
      for (const block of blocks) {
        if (block && block.type === 'tool_use' && typeof block.name === 'string') {
          toolCounts[block.name] = (toolCounts[block.name] ?? 0) + 1;
        }
      }
    }
  }
  return { sessionId, times, models, toolCounts };
}

/**
 * Assemble the signed-payload object (v1). Throws if the log has no readable
 * timestamps (we can't describe a session we can't place in time).
 */
export function buildRecord(jsonl, { cliVersion, now = new Date() } = {}) {
  const { sessionId, times, models, toolCounts } = scanSession(jsonl);
  if (times.length === 0) {
    throw new Error('No readable timestamps in this session log — is it a Claude Code .jsonl?');
  }
  const sorted = times.map((t) => Date.parse(t)).sort((a, b) => a - b);
  const started = new Date(sorted[0]);
  const ended = new Date(sorted[sorted.length - 1]);
  const durationSeconds = Math.max(0, Math.round((ended.getTime() - started.getTime()) / 1000));

  // One record per Claude Code session: hash the session id (a UUID — metadata,
  // not content). Fall back to hashing the whole log so the record is still
  // stable and unique when an older log has no sessionId.
  const ccSessionHash = sha256Hex(sessionId ? `cc-session:${sessionId}` : `cc-log:${jsonl}`);

  const evals = detectEvals(jsonl);

  return {
    v: 1,
    cc_session_hash: ccSessionHash,
    started_at: started.toISOString(),
    ended_at: ended.toISOString(),
    duration_seconds: durationSeconds,
    models: [...models].sort(),
    tool_call_counts: toolCounts,
    evals,
    generated_at: now.toISOString(),
    cli_version: cliVersion,
  };
}
