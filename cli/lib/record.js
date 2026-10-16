// Build a flight record from a Claude Code session log.
//
// The payload is METADATA ONLY — counts, model names, timestamps, a one-way
// session hash, and the eval signals from eval-detector. It never contains
// prompts, code, file contents, file paths, or command text. What you see
// printed by `agentriders log` is exactly what the object below carries.

import crypto from 'node:crypto';
import { detectEvals } from '../eval-detector.js';

const sha256Hex = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

// Bucket a tool name to what the server accepts AND to keep identity off the
// wire. Any MCP tool (`mcp__<server>__<tool>`) collapses to "mcp" — the server
// segment is frequently project/company identity, which must never leave the
// machine. Everything else is reduced to the server's safe charset and length
// (TOOL_NAME_RE / 60 chars), so the CLI never signs a payload the server would
// then reject.
function normalizeToolName(name) {
  if (name.startsWith('mcp__')) return 'mcp';
  const clean = name.replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 60);
  return clean || 'tool';
}

// Keep at most `max` distinct tool buckets (the server caps at 60); the
// least-used overflow folds into "other". In practice MCP bucketing already
// keeps this well under the cap.
function capToolCounts(counts, max = 60) {
  const keys = Object.keys(counts);
  if (keys.length <= max) return counts;
  keys.sort((a, b) => counts[b] - counts[a]);
  const kept = {};
  let other = 0;
  keys.forEach((k, i) => {
    if (i < max - 1) kept[k] = counts[k];
    else other += counts[k];
  });
  kept.other = (kept.other ?? 0) + other;
  return kept;
}

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
      // Claude Code stamps locally generated messages with "<synthetic>" —
      // not a model, and the server's model-name check rejects the brackets.
      if (typeof msg.model === 'string' && msg.model && msg.model !== '<synthetic>') models.add(msg.model);
      const blocks = Array.isArray(msg.content) ? msg.content : [];
      for (const block of blocks) {
        if (block && block.type === 'tool_use' && typeof block.name === 'string') {
          const key = normalizeToolName(block.name);
          toolCounts[key] = (toolCounts[key] ?? 0) + 1;
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
  if (models.size === 0) {
    throw new Error('No model recorded in this session — not a completed Claude Code flight?');
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
    tool_call_counts: capToolCounts(toolCounts),
    evals,
    generated_at: now.toISOString(),
    cli_version: cliVersion,
  };
}
