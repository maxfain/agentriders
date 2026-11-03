import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyOutcome, pickReviewerExcerpt } from '../src/classify.ts';
import { firstWords } from '../src/text.ts';

const base = {
  state: 'merged' as const,
  openedAt: '2026-01-01T00:00:00Z',
  changeRequests: 0,
  humanReviewCount: 0,
  humanCommentCount: 0,
  commitsAfterFirstReview: 0,
};

test('merged_clean: merged, no changes requested, one review round', () => {
  assert.equal(classifyOutcome(base), 'merged_clean');
  assert.equal(classifyOutcome({ ...base, commitsAfterFirstReview: 1 }), 'merged_clean');
});

test('merged_after_rework: a changes-requested review, or 2+ commits after first review', () => {
  assert.equal(classifyOutcome({ ...base, changeRequests: 1 }), 'merged_after_rework');
  assert.equal(classifyOutcome({ ...base, commitsAfterFirstReview: 2 }), 'merged_after_rework');
});

test('burn: closed unmerged with human engagement', () => {
  assert.equal(classifyOutcome({ ...base, state: 'closed', humanReviewCount: 1 }), 'burn');
  assert.equal(classifyOutcome({ ...base, state: 'closed', humanCommentCount: 1 }), 'burn');
});

test('abandoned: closed unmerged, nobody human engaged', () => {
  assert.equal(classifyOutcome({ ...base, state: 'closed' }), 'abandoned');
});

test('open under 30 days; stale at 30', () => {
  const now = new Date('2026-01-20T00:00:00Z');
  assert.equal(classifyOutcome({ ...base, state: 'open' }, now), 'open');
  const later = new Date('2026-02-01T00:00:00Z');
  assert.equal(classifyOutcome({ ...base, state: 'open' }, later), 'stale');
});

test('reviewer excerpt: earliest changes-requested wins, author and bots excluded', () => {
  const pick = pickReviewerExcerpt(
    [
      { kind: 'comment', authorLogin: 'the-author', authorIsBot: false, body: 'my own comment', createdAt: '2026-01-01T00:00:00Z', url: 'u0' },
      { kind: 'review', state: 'CHANGES_REQUESTED', authorLogin: 'rev2', authorIsBot: false, body: 'Later objection', createdAt: '2026-01-03T00:00:00Z', url: 'u2' },
      { kind: 'review', state: 'CHANGES_REQUESTED', authorLogin: 'rev1', authorIsBot: false, body: 'Please do not do async execution here', createdAt: '2026-01-02T00:00:00Z', url: 'u1' },
    ],
    'the-author',
    firstWords,
  );
  assert.equal(pick?.excerpt, 'Please do not do async execution here');
  assert.equal(pick?.url, 'u1');
});

test('reviewer excerpt: falls back to earliest non-author human; verbatim 25 words', () => {
  const words = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ');
  const pick = pickReviewerExcerpt(
    [
      { kind: 'comment', authorLogin: 'bot[bot]', authorIsBot: true, body: 'bot noise', createdAt: '2026-01-01T00:00:00Z', url: 'b' },
      { kind: 'comment', authorLogin: 'human2', authorIsBot: false, body: words, createdAt: '2026-01-02T00:00:00Z', url: 'h' },
    ],
    'the-author',
    firstWords,
  );
  assert.equal(pick?.excerpt, Array.from({ length: 25 }, (_, i) => `w${i}`).join(' '));
});

test('reviewer excerpt: a bot changes-requested review never wins over a human', () => {
  const pick = pickReviewerExcerpt(
    [
      { kind: 'review', state: 'CHANGES_REQUESTED', authorLogin: 'ci-bot[bot]', authorIsBot: true, body: 'automated gate failed', createdAt: '2026-01-01T00:00:00Z', url: 'bot' },
      { kind: 'comment', authorLogin: 'human', authorIsBot: false, body: 'This needs a real fix in the parser', createdAt: '2026-01-02T00:00:00Z', url: 'human' },
    ],
    'the-author',
    firstWords,
  );
  assert.equal(pick?.url, 'human');
});

test('reviewer excerpt: nothing usable → null', () => {
  assert.equal(pickReviewerExcerpt([], 'a', firstWords), null);
  assert.equal(
    pickReviewerExcerpt(
      [{ kind: 'comment', authorLogin: 'bot[bot]', authorIsBot: true, body: 'x', createdAt: null, url: null }],
      'a',
      firstWords,
    ),
    null,
  );
});
