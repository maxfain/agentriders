import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_LABELS, flightTitle, fmtHours, fmtRate, isAgentSlug, outcomeTone,
  validOwner, validRepoName,
} from '../src/lib/flightlog.ts';
import { safeNextPath } from '../src/lib/next-path.ts';
import { flightArticle } from '../src/lib/seo.ts';

test('owner/repo path validation mirrors GitHub naming', () => {
  assert.ok(validOwner('anthropics'));
  assert.ok(validOwner('a1-b2'));
  assert.ok(!validOwner('-leading'));
  assert.ok(!validOwner('has/slash'));
  assert.ok(!validOwner(''));
  assert.ok(validRepoName('claude-code'));
  assert.ok(validRepoName('x.y_z-1'));
  assert.ok(!validRepoName('..'));
  assert.ok(!validRepoName('a b'));
});

test('agent slugs and labels', () => {
  assert.ok(isAgentSlug('claude-code'));
  assert.ok(!isAgentSlug('claude code'));
  assert.equal(AGENT_LABELS['openai-codex'], 'OpenAI Codex');
});

test('outcome tones drive the badge colors', () => {
  assert.equal(outcomeTone('merged_clean'), 'ok');
  assert.equal(outcomeTone('merged_after_rework'), 'warn');
  assert.equal(outcomeTone('burn'), 'burn');
  assert.equal(outcomeTone('abandoned'), 'quiet');
  assert.equal(outcomeTone(null), 'quiet');
});

test('hours formatting: minutes, hours, days', () => {
  assert.equal(fmtHours(0.4), '24 min');
  assert.equal(fmtHours(30.16), '30.2 h');
  assert.equal(fmtHours(120), '5 d');
  assert.equal(fmtHours(null), '—');
  assert.equal(fmtHours('30.16'), '30.2 h');
});

test('rates render as whole percent', () => {
  assert.equal(fmtRate(0.542), '54%');
  assert.equal(fmtRate('0.839'), '84%');
  assert.equal(fmtRate(null), '—');
});

test('the flight page title pattern from the brief', () => {
  assert.equal(
    flightTitle('Add memory limit', 'claude-code', 'jamsocket/forevervm'),
    'Add memory limit — Claude Code flight in jamsocket/forevervm',
  );
});

test('safeNextPath allows only sign-in CTA surfaces', () => {
  assert.equal(safeNextPath('/logs/acme/widget/12/'), '/logs/acme/widget/12/');
  assert.equal(safeNextPath('/opt-out/'), '/opt-out/');
  assert.equal(safeNextPath('/me/flights/'), '/me/flights/');
  assert.equal(safeNextPath('/logs/acme/widget/12/?x=1#y'), '/logs/acme/widget/12/');
  assert.equal(safeNextPath('https://evil.example/'), null);
  assert.equal(safeNextPath('//evil.example/'), null);
  assert.equal(safeNextPath('/admin/'), null);
  assert.equal(safeNextPath('/logs/acme/widget/12'), null); // unslashed form never issued
  assert.equal(safeNextPath(null), null);
});

test('flight JSON-LD: author is the GitHub login, about is the repository', () => {
  const node = flightArticle({
    headline: 'T — Claude Code flight in acme/widget',
    description: 'd',
    path: '/logs/acme/widget/12/',
    authorLogin: 'octocat',
    repoFullName: 'acme/widget',
    prUrl: 'https://github.com/acme/widget/pull/12',
  }) as Record<string, unknown>;
  assert.equal((node.author as { name: string }).name, 'octocat');
  assert.equal((node.author as { sameAs: string }).sameAs, 'https://github.com/octocat');
  assert.equal((node.about as { codeRepository: string }).codeRepository, 'https://github.com/acme/widget');
  assert.equal(node.url, 'https://agentriders.com/logs/acme/widget/12/');
});
