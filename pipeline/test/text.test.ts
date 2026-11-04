import { test } from 'node:test';
import assert from 'node:assert/strict';
import { excerpt300, firstWords, hoursBetween, readmeExcerpt, wordCount } from '../src/text.ts';
import { discoverySql } from '../src/bigquery.ts';
import { buildPrBatchQuery } from '../src/github-graphql.ts';
import { fullNameFromRepoUrl, pgTextArray } from '../src/jobs/load-aidev.ts';

test('excerpt300: 300 code points, never a split surrogate pair', () => {
  const emoji = '🐉'.repeat(400);
  const { excerpt, chars } = excerpt300(emoji);
  assert.equal(chars, 400);
  assert.equal(Array.from(excerpt!).length, 300);
  assert.doesNotThrow(() => encodeURIComponent(excerpt!));
  assert.deepEqual(excerpt300(null), { excerpt: null, chars: 0 });
  assert.deepEqual(excerpt300('  '), { excerpt: null, chars: 0 });
});

test('firstWords and wordCount agree on whitespace', () => {
  assert.equal(firstWords('a  b\n\nc d', 3), 'a b c');
  assert.equal(wordCount(' a  b\nc '), 3);
});

test('hoursBetween', () => {
  assert.equal(hoursBetween('2026-01-01T00:00:00Z', '2026-01-02T06:00:00Z'), 30);
  assert.equal(hoursBetween('2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z'), null);
  assert.equal(hoursBetween(null, '2026-01-01T00:00:00Z'), null);
});

test('pg text[] literal escaping', () => {
  assert.equal(pgTextArray(['a', 'b"c', 'd\\e']), '{"a","b\\"c","d\\\\e"}');
});

test('repo full name from api and html urls', () => {
  assert.equal(fullNameFromRepoUrl('https://api.github.com/repos/acme/widget'), 'acme/widget');
  assert.equal(fullNameFromRepoUrl('https://github.com/acme/widget'), 'acme/widget');
  assert.equal(fullNameFromRepoUrl('nonsense'), null);
});

test('discovery SQL: date validated and interpolated once', () => {
  const sql = discoverySql('20261101');
  assert.ok(sql.includes('`githubarchive.day.20261101`'));
  assert.ok(sql.includes("'devin-ai-integration[bot]'"));
  assert.throws(() => discoverySql('2026-11-01'));
  assert.throws(() => discoverySql('drop table'));
});

test('GraphQL batch query aliases and escapes names', () => {
  const q = buildPrBatchQuery([
    { owner: 'acme', name: 'widget', number: 7 },
    { owner: 'o"wner', name: 'x', number: 8 },
  ]);
  assert.ok(q.includes('p0: repository(owner: "acme", name: "widget")'));
  assert.ok(q.includes('pullRequest(number: 7)'));
  assert.ok(q.includes('"o\\"wner"'));
  assert.ok(q.includes('rateLimit { remaining resetAt cost }'));
  assert.ok(q.includes('fragment PrFields on PullRequest'));
});

test('readmeExcerpt: first readable paragraph, plain text, 25 words at most', () => {
  assert.equal(readmeExcerpt(null), null);
  assert.equal(readmeExcerpt(''), null);
  // Badges, images and headings only: nothing readable.
  assert.equal(readmeExcerpt('# Hi 👋\n\n[![ci](https://img.example/ci.svg)](https://ci.example) ![x](https://img.example/x.png)\n'), null);
  // Heading dropped, link text kept, emphasis stripped, the first paragraph only.
  assert.equal(
    readmeExcerpt('<!-- a comment -->\n## About me\n\nI build **sandboxes** for agents at [Acme](https://acme.example).\n\nSecond paragraph.'),
    'I build sandboxes for agents at Acme.',
  );
  // HTML READMEs read as text.
  assert.equal(readmeExcerpt('<h1 align="center">Hi</h1><p>I am <b>Jane</b>, I build things for people.</p>'), 'Hi I am Jane, I build things for people.');
  // Lists and blockquotes lose their markers; code blocks go.
  assert.equal(readmeExcerpt('```sh\nnpm i\n```\n\n- Currently working on an agent harness for teams\n- Also writing'), 'Currently working on an agent harness for teams Also writing');
  // A bare URL paragraph is skipped; 25 words cap.
  const long = readmeExcerpt('https://example.com\n\n' + Array.from({ length: 40 }, (_, i) => `word${i}`).join(' '));
  assert.equal(long!.split(' ').length, 25);
});
