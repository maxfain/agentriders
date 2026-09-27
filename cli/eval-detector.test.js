import test from 'node:test';
import assert from 'node:assert/strict';
import { detectEvals, parsePassFail, scoreEvals, isScoreEligible } from './eval-detector.js';

// --- Synthetic Claude Code session logs ------------------------------------
// Events mirror the JSONL shape Claude Code writes: one entry per line,
// tool_use blocks in assistant messages, tool_result blocks in user messages.

let nextId = 0;
const id = () => `toolu_${String(++nextId).padStart(4, '0')}`;

const line = (obj) => JSON.stringify(obj);
const assistant = (cwd, ...blocks) =>
  line({ type: 'assistant', cwd, message: { role: 'assistant', content: blocks } });
const toolResult = (toolUseId, text, isError = false) =>
  line({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: toolUseId, is_error: isError, content: [{ type: 'text', text }] }] },
  });

const write = (cwd, file_path, content) =>
  assistant(cwd, { type: 'tool_use', id: id(), name: 'Write', input: { file_path, content } });
const edit = (cwd, file_path, new_string) =>
  assistant(cwd, { type: 'tool_use', id: id(), name: 'Edit', input: { file_path, new_string } });
const bash = (cwd, command) => {
  const toolUseId = id();
  return { jsonl: assistant(cwd, { type: 'tool_use', id: toolUseId, name: 'Bash', input: { command } }), toolUseId };
};
const log = (...lines) => lines.join('\n') + '\n';

const CWD = '/home/rider/acme-web';

// 1. No eval activity at all.
function fixtureNoEvals() {
  const build = bash(CWD, 'npm run build');
  return log(
    write(CWD, `${CWD}/src/app.ts`, 'export const app = () => 42;'),
    build.jsonl,
    toolResult(build.toolUseId, 'built in 1.2s'),
  );
}

// 2. Eval file creation only — never run. Includes a whitespace-only rewrite
//    that must NOT double-count.
function fixtureCreationOnly() {
  const content = "import { test } from 'vitest';\ntest('adds', () => {});";
  const reformatted = "import { test }  from  'vitest';\n\ntest('adds',  ()  =>  {});\n";
  return log(
    write(CWD, `${CWD}/src/checkout.test.ts`, content),
    write(CWD, `${CWD}/src/checkout.test.ts`, reformatted),
  );
}

// 3. A full write → run → fail → fix → re-run cycle.
function fixtureFullCycle() {
  const run1 = bash(CWD, 'npx vitest run');
  const run2 = bash(CWD, 'npx vitest run');
  return log(
    write(CWD, `${CWD}/src/cart.test.ts`, "test('total', () => expect(total([2,3])).toBe(5));"),
    run1.jsonl,
    toolResult(run1.toolUseId, 'Tests:  1 failed, 4 passed, 5 total', true),
    edit(CWD, `${CWD}/src/cart.ts`, 'export const total = (xs) => xs.reduce((a, b) => a + b, 0);'),
    run2.jsonl,
    toolResult(run2.toolUseId, 'Tests:  5 passed, 5 total'),
  );
}

// 4. Pass-rate improvement across two pytest runs.
function fixturePassRateImprovement() {
  const run1 = bash(CWD, 'pytest -q');
  const run2 = bash(CWD, 'pytest -q');
  return log(
    write(CWD, `${CWD}/tests/test_triage.py`, 'import pytest\n\ndef test_labels():\n    assert triage("hi") == "low"'),
    run1.jsonl,
    toolResult(run1.toolUseId, '3 passed, 2 failed in 0.41s', true),
    edit(CWD, `${CWD}/prompts/triage.md`, 'Label every lead by the saved CRM view.'),
    run2.jsonl,
    toolResult(run2.toolUseId, '5 passed in 0.38s'),
  );
}

// --- detectEvals -----------------------------------------------------------

test('no eval activity yields an all-zero record', () => {
  const evals = detectEvals(fixtureNoEvals());
  assert.deepEqual(evals, {
    eval_files_created: 0,
    eval_frameworks_detected: [],
    eval_run_count: 0,
    eval_iteration_cycles: 0,
    pass_rate_delta: null,
    workflows_with_evals: 0,
  });
  assert.equal(isScoreEligible(evals), false);
  assert.equal(scoreEvals(evals), 0);
});

test('file creation without a run detects the file but scores zero', () => {
  const evals = detectEvals(fixtureCreationOnly());
  assert.equal(evals.eval_files_created, 1); // whitespace rewrite deduped by content hash
  assert.equal(evals.eval_run_count, 0);
  assert.equal(evals.eval_iteration_cycles, 0);
  assert.equal(evals.workflows_with_evals, 1);
  assert.equal(isScoreEligible(evals), false);
  assert.equal(scoreEvals(evals), 0); // the "touch a file and walk away" exploit
});

test('write→run→fail→fix→re-run counts one iteration cycle', () => {
  const evals = detectEvals(fixtureFullCycle());
  assert.equal(evals.eval_files_created, 1);
  assert.equal(evals.eval_run_count, 2);
  assert.equal(evals.eval_iteration_cycles, 1);
  assert.equal(evals.pass_rate_delta, 0.2); // 4/5 -> 5/5
  assert.equal(evals.workflows_with_evals, 1);
  assert.equal(isScoreEligible(evals), true);
  assert.ok(scoreEvals(evals) > 0);
});

test('pass-rate improvement across runs is reported as a delta', () => {
  const evals = detectEvals(fixturePassRateImprovement());
  assert.equal(evals.eval_run_count, 2);
  assert.equal(evals.pass_rate_delta, 0.4); // 3/5 -> 5/5
  assert.ok(evals.eval_frameworks_detected.includes('pytest'));
  assert.equal(evals.eval_iteration_cycles, 1);
});

test('frameworks are detected from configs and commands', () => {
  const run = bash(CWD, 'promptfoo eval');
  const evals = detectEvals(
    log(
      write(CWD, `${CWD}/promptfooconfig.yaml`, 'prompts:\n  - "Summarize: {{input}}"'),
      run.jsonl,
      toolResult(run.toolUseId, 'Successes: 4\nFailures: 1', true),
    ),
  );
  assert.ok(evals.eval_frameworks_detected.includes('promptfoo'));
  assert.equal(evals.eval_files_created, 1); // config file counts as an eval artifact
  assert.equal(evals.eval_run_count, 1);
});

test('breadth counts distinct workflows, and caps limit per-session totals', () => {
  const lines = [];
  for (let i = 0; i < 14; i++) {
    lines.push(write(`/home/rider/project-${i % 3}`, `/home/rider/project-${i % 3}/f${i}.test.ts`, `test('t${i}', () => {});`));
  }
  const run = bash('/home/rider/project-0', 'npm test');
  lines.push(run.jsonl, toolResult(run.toolUseId, 'Tests:  14 passed, 14 total'));
  const evals = detectEvals(lines.join('\n'));
  assert.equal(evals.eval_files_created, 10); // capped from 14
  assert.equal(evals.workflows_with_evals, 3);
});

test('identical content pasted to many paths counts once (anti-gaming)', () => {
  const same = "test('x', () => {});";
  const run = bash(CWD, 'npm test');
  const evals = detectEvals(
    log(
      write(CWD, `${CWD}/a.test.ts`, same),
      write(CWD, `${CWD}/b.test.ts`, same),
      write(CWD, `${CWD}/c.test.ts`, same),
      run.jsonl,
      toolResult(run.toolUseId, 'Tests:  1 passed, 1 total'),
    ),
  );
  assert.equal(evals.eval_files_created, 1);
});

// --- parsePassFail ---------------------------------------------------------

test('parsePassFail reads common runner outputs', () => {
  assert.deepEqual(parsePassFail('Tests:  2 failed, 5 passed, 7 total'), { passed: 5, failed: 2 });
  assert.deepEqual(parsePassFail('== 7 passed, 1 failed in 2.1s =='), { passed: 7, failed: 1 });
  assert.deepEqual(parsePassFail('5 passing\n2 failing'), { passed: 5, failed: 2 });
  assert.deepEqual(parsePassFail('# pass 3\n# fail 1'), { passed: 3, failed: 1 });
  assert.deepEqual(parsePassFail('Successes: 9\nFailures: 0'), { passed: 9, failed: 0 });
  assert.equal(parsePassFail('built in 1.2s'), null);
  assert.equal(parsePassFail(''), null);
});

// --- Robustness ------------------------------------------------------------

test('malformed lines and unknown tools are skipped, not fatal', () => {
  const evals = detectEvals('not json\n{"type":"assistant"}\n{"message":{"content":[{"type":"tool_use","name":"Mystery","input":{}}]}}\n');
  assert.equal(evals.eval_run_count, 0);
  assert.equal(evals.eval_files_created, 0);
});
