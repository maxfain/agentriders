import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  logFrontmatterSchema,
  slugify,
  isValidSlug,
  type LogFrontmatter,
} from '../src/lib/log-schema.ts';
import { serializeLog, parseLog, parseAndValidateLog } from '../src/lib/frontmatter.ts';

const sample: LogFrontmatter = {
  title: 'Migrated 214 unit tests to Vitest',
  date: '2026-09-20',
  rider: 'maxfain',
  mount: 'Claude Code',
  model: 'Claude Opus 4',
  harness: 'Claude Code CLI',
  task: 'code',
  duration: '3h 10m',
  cost_usd: 41,
  outcome: 'landed',
  burns: [{ what: 'Deleted a test fixture', recovery: 'Restored from git', cost_usd: 0 }],
  lesson: 'Give it a branch, not the repo.',
  reins: { scope: 'acme/web, branch only', budget: '$50 per flight', kill_switch: 'on', autonomy: 'Rider' },
  draft: false,
};

test('schema: accepts a valid log', () => {
  const parsed = logFrontmatterSchema.parse(sample);
  assert.equal(parsed.title, sample.title);
  assert.equal(parsed.burns.length, 1);
});

test('schema: rejects bad enums and missing required fields', () => {
  assert.throws(() => logFrontmatterSchema.parse({ ...sample, task: 'cooking' }));
  assert.throws(() => logFrontmatterSchema.parse({ ...sample, outcome: 'great' }));
  assert.throws(() => logFrontmatterSchema.parse({ ...sample, date: '09/20/2026' }));
  assert.throws(() => logFrontmatterSchema.parse({ ...sample, cost_usd: -5 }));
  const { reins, ...noReins } = sample;
  assert.throws(() => logFrontmatterSchema.parse(noReins));
});

test('schema: rejects shape-valid but calendar-invalid dates (build-breaker guard)', () => {
  for (const bad of ['2026-13-45', '2026-02-30', '2026-00-10', '2026-04-31', '2025-02-29']) {
    assert.throws(() => logFrontmatterSchema.parse({ ...sample, date: bad }), new RegExp('.'), bad);
  }
  for (const good of ['2026-02-28', '2024-02-29', '2026-12-31', '2026-01-01']) {
    assert.equal(logFrontmatterSchema.parse({ ...sample, date: good }).date, good);
  }
});

test('schema: burns defaults to empty array', () => {
  const { burns, ...noBurns } = sample;
  assert.deepEqual(logFrontmatterSchema.parse(noBurns).burns, []);
});

test('slugify: produces clean url slugs', () => {
  assert.equal(slugify('Migrated 214 unit tests to Vitest'), 'migrated-214-unit-tests-to-vitest');
  assert.equal(slugify('  Spaces & Symbols!! '), 'spaces-symbols');
  assert.equal(slugify('Already-Clean'), 'already-clean');
  assert.ok(isValidSlug(slugify('A Normal Title')));
  assert.ok(!isValidSlug(''));
  assert.ok(!isValidSlug('-leading'));
  assert.ok(!isValidSlug('Has Spaces'));
});

test('frontmatter: serialize → parse round-trips', () => {
  const md = serializeLog(sample, 'The body of the log.\n');
  assert.match(md, /^---\n/);
  assert.match(md, /\n---\n\nThe body of the log\.\n$/);
  const { frontmatter, body } = parseAndValidateLog(md);
  assert.deepEqual(frontmatter, sample);
  assert.equal(body.trim(), 'The body of the log.');
});

test('frontmatter: drops empty optional fields, keeps present ones', () => {
  const md = serializeLog({ ...sample, model: '', harness: undefined }, '');
  assert.ok(!/\bmodel:/.test(md));
  assert.ok(!/\bharness:/.test(md));
  const withModel = serializeLog(sample, '');
  assert.match(withModel, /model: "Claude Opus 4"/);
});

test('frontmatter: escaping — colons, quotes, hashes survive', () => {
  const tricky: LogFrontmatter = {
    ...sample,
    title: 'Fix: the "weird" #1 bug: part 2',
    lesson: "Don't trust a prompt that says: just ship it #yolo",
    reins: { ...sample.reins, scope: 'repo: acme/web, path: src/' },
  };
  const { frontmatter } = parseAndValidateLog(serializeLog(tricky, 'body'));
  assert.equal(frontmatter.title, tricky.title);
  assert.equal(frontmatter.lesson, tricky.lesson);
  assert.equal(frontmatter.reins.scope, tricky.reins.scope);
});

test('frontmatter: date written as string survives as yyyy-mm-dd', () => {
  const md = serializeLog(sample, '');
  // Whether YAML quotes it or not, parse must give back the ISO string.
  assert.equal(parseLog(md).frontmatter.date, '2026-09-20');
});

test('frontmatter: parses a legacy file with an unquoted date', () => {
  const legacy = [
    '---',
    'title: "Legacy log"',
    'date: 2026-09-12',
    'rider: "example"',
    'mount: "n8n"',
    'task: "sales"',
    'duration: "5d"',
    'cost_usd: 28',
    'outcome: "landed"',
    'lesson: "Scope it."',
    'reins:',
    '  scope: "one view"',
    '  budget: "$30/wk"',
    '  kill_switch: "on"',
    '  autonomy: "Fledgling"',
    'draft: false',
    '---',
    '',
    'Body here.',
  ].join('\n');
  const { frontmatter, body } = parseAndValidateLog(legacy);
  assert.equal(frontmatter.date, '2026-09-12');
  assert.equal(frontmatter.burns.length, 0);
  assert.equal(body, 'Body here.');
});
