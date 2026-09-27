// eval-detector.js — detects eval *practice* in a Claude Code session log.
//
// Standalone module for the `agentriders` CLI pipeline (see cli/README.md).
// It reads a session log (JSONL, one event per line, as Claude Code writes
// under ~/.claude/projects/<project>/<session>.jsonl) and returns metadata
// about eval activity: counts, framework names, pass/fail deltas. It never
// returns, persists, or transmits the content of test files or the code
// under test — file contents are consumed only to hash (dedupe) and to
// pattern-match framework names, then discarded.
//
// The main pipeline merges the result into the flight record as an `evals`
// sub-object. Scoring is exported separately (scoreEvals) and is PROVISIONAL:
// weights are a proposal to be reviewed before anything feeds rank scoring.

import { createHash } from 'node:crypto';

// --- Tunable constants -----------------------------------------------------

// File-path patterns that mark a write as an eval/test artifact (spec § 2).
export const EVAL_FILE_PATTERNS = [
  /(^|\/)test_[^/]+\.py$/, //            test_*.py
  /\.test\.[a-z]+$/i, //                 *.test.ts (and .js/.tsx/…)
  /\.eval\.[a-z]+$/i, //                 *.eval.*
  /_spec\.rb$/, //                       *_spec.rb
  /(^|\/)promptfoo(config)?\.ya?ml$/, // promptfoo configs
  /(^|\/)\.promptfoorc(\.[a-z]+)?$/,
  /(^|\/)deepeval(\.config)?\.(js|json|ya?ml)$/,
  /(^|\/)\.deepeval(\/|$)/,
  /(^|\/)braintrust(\.config)?\.(js|ts|json|ya?ml)$/,
];

// Commands that count as actually *running* tests/evals (spec § 2).
export const RUN_COMMAND_PATTERNS = [
  /\bpytest\b/,
  /\bnpm\s+test\b/,
  /\bnpm\s+run\s+test[\w:-]*/,
  /\byarn\s+(run\s+)?test\b/,
  /\bpnpm\s+(run\s+)?test\b/,
  /\b(npx\s+)?vitest\b/,
  /\b(npx\s+)?jest\b/,
  /\b(npx\s+)?mocha\b/,
  /\bnode\s+--test\b/,
  /\bpromptfoo\s+eval\b/,
  /\bdeepeval\s+test\b/,
  /\bbraintrust\s+eval\b/,
  /\bgo\s+test\b/,
  /\bcargo\s+test\b/,
];

// Framework fingerprints, checked against file writes and commands (spec § 2).
const FRAMEWORK_FINGERPRINTS = [
  ['promptfoo', /\bpromptfoo\b/],
  ['deepeval', /\bdeepeval\b/],
  ['braintrust', /\bbraintrust\b/],
  ['langsmith', /\blangsmith\b/],
  ['pytest', /(^|\n)\s*(import\s+pytest\b|from\s+pytest\b)|@pytest\.fixture|\bpytest\b/],
  ['custom', /\bassert_eq\s*\(|\bscore\s*\(/],
];

// Anti-gaming caps: one session can only contribute this much (spec § 2).
export const DEFAULT_CAPS = { eval_files_created: 10, eval_iteration_cycles: 5 };

// --- Session log parsing ---------------------------------------------------

// Normalizes a Claude Code session log into an ordered event stream:
//   { kind: 'write',   path, content, cwd }
//   { kind: 'command', command, toolUseId, cwd }
//   { kind: 'result',  toolUseId, text, isError }
// Unknown or malformed lines are skipped; order follows the file.
export function parseSessionLog(jsonl) {
  const events = [];
  for (const line of String(jsonl).split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const cwd = typeof entry.cwd === 'string' ? entry.cwd : null;
    const blocks = Array.isArray(entry.message?.content) ? entry.message.content : [];
    for (const block of blocks) {
      if (block?.type === 'tool_use') {
        const input = block.input ?? {};
        switch (block.name) {
          case 'Write':
            if (input.file_path) {
              events.push({ kind: 'write', path: input.file_path, content: String(input.content ?? ''), cwd });
            }
            break;
          case 'Edit':
            if (input.file_path) {
              events.push({ kind: 'write', path: input.file_path, content: String(input.new_string ?? ''), cwd });
            }
            break;
          case 'MultiEdit':
            if (input.file_path) {
              const joined = (input.edits ?? []).map((e) => e?.new_string ?? '').join('\n');
              events.push({ kind: 'write', path: input.file_path, content: joined, cwd });
            }
            break;
          case 'NotebookEdit':
            if (input.notebook_path) {
              events.push({ kind: 'write', path: input.notebook_path, content: String(input.new_source ?? ''), cwd });
            }
            break;
          case 'Bash':
            if (input.command) {
              events.push({ kind: 'command', command: String(input.command), toolUseId: block.id ?? null, cwd });
            }
            break;
        }
      } else if (block?.type === 'tool_result') {
        events.push({
          kind: 'result',
          toolUseId: block.tool_use_id ?? null,
          text: flattenResultText(block.content),
          isError: block.is_error === true,
        });
      }
    }
  }
  return events;
}

function flattenResultText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((c) => (typeof c === 'string' ? c : (c?.text ?? ''))).join('\n');
  }
  return '';
}

// --- Result parsing --------------------------------------------------------

// Extracts { passed, failed } from common test-runner output, or null.
// Covers pytest, jest/vitest, mocha, node:test, promptfoo summaries.
export function parsePassFail(text) {
  if (!text) return null;
  const t = String(text);
  let m;
  if ((m = t.match(/Tests:\s+(?:(\d+)\s+failed,\s*)?(\d+)\s+passed,\s*\d+\s+total/))) {
    return { passed: +m[2], failed: +(m[1] ?? 0) };
  }
  if ((m = t.match(/(\d+)\s+passing/))) {
    const f = t.match(/(\d+)\s+failing/);
    return { passed: +m[1], failed: +(f?.[1] ?? 0) };
  }
  if ((m = t.match(/# pass (\d+)/))) {
    const f = t.match(/# fail (\d+)/);
    return { passed: +m[1], failed: +(f?.[1] ?? 0) };
  }
  if ((m = t.match(/Successes:\s*(\d+)/i))) {
    const f = t.match(/Failures:\s*(\d+)/i);
    return { passed: +m[1], failed: +(f?.[1] ?? 0) };
  }
  if ((m = t.match(/(\d+)\s+passed/))) {
    const f = t.match(/(\d+)\s+failed/);
    return { passed: +m[1], failed: +(f?.[1] ?? 0) };
  }
  if ((m = t.match(/(\d+)\s+failed/))) {
    return { passed: 0, failed: +m[1] };
  }
  return null;
}

// --- Detection -------------------------------------------------------------

const isEvalPath = (path) => EVAL_FILE_PATTERNS.some((re) => re.test(path));
const isRunCommand = (command) => RUN_COMMAND_PATTERNS.some((re) => re.test(command));

// Hash with whitespace stripped, so trivial edits don't re-trigger (spec § 2).
const contentHash = (content) => createHash('sha256').update(String(content).replace(/\s+/g, '')).digest('hex');

// Project directory for breadth counting: the event's cwd when the log has
// one, else the file's first two path segments.
function workflowKey(event) {
  if (event.cwd) return event.cwd;
  const parts = event.path.replace(/^\//, '').split('/');
  return parts.slice(0, Math.max(1, parts.length - 1)).slice(0, 2).join('/');
}

/**
 * Scans a Claude Code session log (JSONL string) and returns the `evals`
 * sub-object for the flight record. Metadata only — no file contents.
 *
 * {
 *   eval_files_created: int,        // distinct eval files with novel content, capped
 *   eval_frameworks_detected: [string],
 *   eval_run_count: int,
 *   eval_iteration_cycles: int,     // write→run→fail→fix→run sequences, capped
 *   pass_rate_delta: float | null,  // last parseable run minus first, null if <2
 *   workflows_with_evals: int
 * }
 */
export function detectEvals(jsonl, { caps = DEFAULT_CAPS } = {}) {
  const events = parseSessionLog(jsonl);

  const seenHashes = new Set();
  const countedEvalFiles = new Set();
  const frameworks = new Set();
  const workflows = new Set();
  const runResults = []; // { parsed: {passed,failed}|null, failed: bool }
  const resultByToolUse = new Map();

  for (const e of events) {
    if (e.kind === 'result' && e.toolUseId) resultByToolUse.set(e.toolUseId, e);
  }

  let runCount = 0;
  let cycles = 0;
  let sawEvalWrite = false;
  // Cycle state machine: a failing eval run arms it; any subsequent file
  // write is the "fix"; the next eval run closes the cycle.
  let armedByFailure = false;
  let fixedSinceFailure = false;

  for (const e of events) {
    if (e.kind === 'write') {
      const hash = contentHash(e.content);
      const novel = !seenHashes.has(hash);
      seenHashes.add(hash);
      if (isEvalPath(e.path)) {
        sawEvalWrite = true;
        if (novel) countedEvalFiles.add(e.path);
        workflows.add(workflowKey(e));
      }
      for (const [name, re] of FRAMEWORK_FINGERPRINTS) {
        if (re.test(e.content) || re.test(e.path)) frameworks.add(name);
      }
      if (armedByFailure) fixedSinceFailure = true;
    } else if (e.kind === 'command' && isRunCommand(e.command)) {
      runCount += 1;
      for (const [name, re] of FRAMEWORK_FINGERPRINTS) {
        if (re.test(e.command)) frameworks.add(name);
      }
      const result = e.toolUseId ? resultByToolUse.get(e.toolUseId) : undefined;
      const parsed = result ? parsePassFail(result.text) : null;
      const failed = Boolean(result?.isError) || (parsed ? parsed.failed > 0 : false);
      runResults.push({ parsed, failed });

      if (armedByFailure && fixedSinceFailure && sawEvalWrite) {
        cycles += 1;
        armedByFailure = false;
        fixedSinceFailure = false;
      }
      if (failed) {
        armedByFailure = true;
        fixedSinceFailure = false;
      }
    }
  }

  const parseable = runResults.filter((r) => r.parsed && r.parsed.passed + r.parsed.failed > 0);
  let passRateDelta = null;
  if (parseable.length >= 2) {
    const rate = ({ parsed: { passed, failed } }) => passed / (passed + failed);
    passRateDelta = Math.round((rate(parseable[parseable.length - 1]) - rate(parseable[0])) * 10000) / 10000;
  }

  return {
    eval_files_created: Math.min(countedEvalFiles.size, caps.eval_files_created),
    eval_frameworks_detected: [...frameworks].sort(),
    eval_run_count: runCount,
    eval_iteration_cycles: Math.min(cycles, caps.eval_iteration_cycles),
    pass_rate_delta: passRateDelta,
    workflows_with_evals: workflows.size,
  };
}

// --- Scoring (PROVISIONAL — review before wiring into rank scoring) --------

// No points at all without at least one actual run (spec § 2 anti-gaming).
export const isScoreEligible = (evals) => evals.eval_run_count >= 1;

// Proposed weights, per spec § 2's scoring model:
//   - file creation: small, capped (easiest signal to fake)
//   - iteration cycles: the discipline being rewarded, weighted highest
//   - pass-rate improvement: bonus
//   - breadth (workflows_with_evals) scales the total, raw file count doesn't
export const DEFAULT_WEIGHTS = { perFile: 1, perCycle: 5, passBonusMax: 8, perExtraWorkflow: 0.25 };

export function scoreEvals(evals, weights = DEFAULT_WEIGHTS) {
  if (!isScoreEligible(evals)) return 0;
  const base =
    evals.eval_files_created * weights.perFile +
    evals.eval_iteration_cycles * weights.perCycle +
    (evals.pass_rate_delta > 0 ? Math.round(evals.pass_rate_delta * weights.passBonusMax) : 0);
  const breadth = 1 + weights.perExtraWorkflow * Math.max(0, Math.min(evals.workflows_with_evals, 4) - 1);
  return Math.round(base * breadth);
}
