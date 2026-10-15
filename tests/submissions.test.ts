import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSubmission } from '../src/lib/submissions.ts';

const base = {
  title: 'Shipped a thing',
  date: '2026-10-15',
  mount: 'Claude Code',
  task: 'code',
  duration: '2h',
  cost_usd: 10,
  outcome: 'landed',
  lesson: 'Branch, never main.',
  reins: { scope: 's', budget: 'b', kill_switch: 'k', autonomy: 'a' },
  body_md: 'story',
};

test('buildSubmission: new forces rider and derives slug from title', () => {
  const b = buildSubmission({ ...base }, 'maxfain');
  assert.equal(b.kind, 'new');
  assert.equal(b.slug, 'shipped-a-thing');
  assert.equal(b.target_log_slug, null);
  assert.equal(b.frontmatter.rider, 'maxfain');
  assert.equal(b.frontmatter.draft, false);
});

test('buildSubmission: new honors an explicit valid slug', () => {
  const b = buildSubmission({ ...base, slug: 'Custom-Slug' }, 'maxfain');
  assert.equal(b.slug, 'custom-slug');
});

test('buildSubmission: a client-sent rider is ignored (forced to session handle)', () => {
  const b = buildSubmission({ ...base, rider: 'attacker' } as never, 'maxfain');
  assert.equal(b.frontmatter.rider, 'maxfain');
});

test('buildSubmission: edit forces slug == target_log_slug (no repointing)', () => {
  // Even if a divergent slug is sent, an edit commits to its target.
  const b = buildSubmission(
    { ...base, kind: 'edit', target_log_slug: 'victim-log', slug: 'some-other-log' },
    'maxfain',
  );
  assert.equal(b.kind, 'edit');
  assert.equal(b.target_log_slug, 'victim-log');
  assert.equal(b.slug, 'victim-log');
});

test('buildSubmission: edit falls back to slug when no explicit target', () => {
  const b = buildSubmission({ ...base, kind: 'edit', slug: 'my-log' }, 'maxfain');
  assert.equal(b.target_log_slug, 'my-log');
  assert.equal(b.slug, 'my-log');
});

test('buildSubmission: edit with no valid target is rejected', () => {
  assert.throws(() => buildSubmission({ ...base, kind: 'edit', target_log_slug: 'Bad Slug!' }, 'maxfain'));
  assert.throws(() => buildSubmission({ ...base, kind: 'edit', target_log_slug: '', slug: '' }, 'maxfain'));
});

test('buildSubmission: body is bounded', () => {
  const b = buildSubmission({ ...base, body_md: 'x'.repeat(25000) }, 'maxfain');
  assert.equal(b.body_md.length, 20000);
});
