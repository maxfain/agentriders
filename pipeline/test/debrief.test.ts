import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDebriefPrompt, validateDebrief, type DebriefRecord } from '../src/debrief.ts';

const record: DebriefRecord = {
  title: 'Add memory limit option to CLI',
  body_excerpt: 'Adds a --memory flag.',
  agent_label: 'Claude Code',
  repo: 'jamsocket/forevervm',
  task_type: 'feat',
  outcome: 'merged_after_rework',
  state: 'merged',
  additions: 395,
  deletions: 126,
  files_changed: 23,
  commits: 5,
  review_count: 3,
  change_requests: 1,
  review_comment_count: 2,
  hours_to_merge: 30.16,
  reviewer_excerpt: "Don't do async execution in completions_and_run_tools()",
};

// 47 words, numbers from the record, one verbatim quote.
const good =
  'Claude Code adds a memory limit option to the forevervm CLI, touching 23 files with 395 additions and ' +
  '126 deletions across 5 commits. Review flags one change: "Don\'t do async execution" — the agent reworks ' +
  'the branch and the pull request merges after 30.16 hours.';

test('a compliant debrief passes', () => {
  const verdict = validateDebrief(good, record);
  assert.deepEqual(verdict, { ok: true });
});

test('word count outside 40–60 fails', () => {
  assert.equal(validateDebrief('Too short.', record).ok, false);
  const long = Array.from({ length: 70 }, () => 'word').join(' ');
  assert.equal(validateDebrief(long, record).ok, false);
});

test('exclamation marks, emoji, markdown fail', () => {
  assert.equal(validateDebrief(good.replace('.', '!'), record).ok, false);
  assert.equal(validateDebrief(`${good.slice(0, -1)} 🚀`, record).ok, false);
  assert.equal(validateDebrief(good.replace('merges', '**merges**'), record).ok, false);
});

test('a number not in the record fields fails', () => {
  const bad = good.replace('23 files', '24 files');
  const verdict = validateDebrief(bad, record);
  assert.equal(verdict.ok, false);
  assert.ok(!verdict.ok && verdict.reasons.some((r) => r.includes('24')));
});

test('numbers from the title are allowed', () => {
  const r2 = { ...record, title: 'Fix issue #4821 in parser', hours_to_merge: null };
  const text =
    'Claude Code fixes issue #4821 in the parser for forevervm, a change of 395 additions and 126 deletions ' +
    'across 23 files and 5 commits. Review requests one change; the agent pushes a rework and the pull ' +
    'request merges after another round of review and discussion there.';
  assert.deepEqual(validateDebrief(text, r2), { ok: true });
});

test('a spelled-out count not in the record fails', () => {
  // review_count is 3; "nine" (9) is not any field value.
  const text =
    'Claude Code adds a memory limit option to the forevervm CLI, touching 23 files with 395 additions ' +
    'and 126 deletions across 5 commits. Nine reviews raise no blocking changes and the branch reworks ' +
    'before the pull request merges after 30.16 hours of review there.';
  const verdict = validateDebrief(text, record);
  assert.equal(verdict.ok, false);
  assert.ok(!verdict.ok && verdict.reasons.some((r) => r.includes('(9)')));
});

test('a quote that is not verbatim from reviewer_excerpt fails', () => {
  const bad = good.replace('"Don\'t do async execution"', '"Never do async execution"');
  const verdict = validateDebrief(bad, record);
  assert.equal(verdict.ok, false);
});

test('motive and sentiment phrasing fails, but only outside quotes', () => {
  const bad = good.replace('the agent reworks', 'the agent decided to rework');
  assert.equal(validateDebrief(bad, record).ok, false);
  // The same banned words inside a verbatim reviewer quote are fine.
  const r2 = { ...record, reviewer_excerpt: 'the reviewer felt this was wrong' };
  const quoted =
    'Claude Code adds a memory limit option to the forevervm CLI, touching 23 files with 395 additions and ' +
    '126 deletions across 5 commits. One review notes "the reviewer felt this was wrong" and the branch is ' +
    'reworked before the pull request merges after 30.16 hours of review.';
  assert.deepEqual(validateDebrief(quoted, r2), { ok: true });
});

test('hours allow rounded and day forms', () => {
  const r2 = { ...record, hours_to_merge: 49.6 };
  const text = good.replace('30.16 hours', '2.1 days');
  assert.deepEqual(validateDebrief(text, r2), { ok: true });
});

test('the prompt carries the record and the hard rules, never a diff', () => {
  const { system, user } = buildDebriefPrompt(record);
  assert.match(system, /48 to 55 words/);
  assert.match(system, /forbidden/i);
  assert.ok(user.includes('"repo": "jamsocket/forevervm"'));
  assert.ok(!user.includes('diff'));
});
