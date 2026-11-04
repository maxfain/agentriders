import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_LABELS, AGENT_SIGNALS_PROSE, AGENT_SLUGS, AGENT_VENDORS, agentAnswer, agentH1Suffix, agentTitle,
  agentWithVendor, authorAnswer, authorDescription, authorDisplay, authorH1Suffix, authorLabel, authorTitle,
  flightAnswer, flightDescription, flightH1Suffix, flightTitle, fmtHours, fmtRate, isAgentSlug, outcomeTone,
  repoAnswer, repoTitle, validOwner, validRepoName,
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

test('every agent has a maker, a product page and search aliases', () => {
  for (const slug of AGENT_SLUGS) {
    const v = AGENT_VENDORS[slug];
    assert.ok(v, slug);
    assert.ok(v.vendor && v.product && /^https:\/\//.test(v.url) && /^https:\/\//.test(v.vendorUrl), slug);
    assert.ok(v.aliases.length > 0, slug);
    assert.ok(AGENT_SIGNALS_PROSE[slug], `${slug} attribution prose`);
  }
  assert.equal(agentWithVendor('claude-code'), 'Claude Code (Anthropic)');
  assert.equal(agentWithVendor('openai-codex'), 'OpenAI Codex (OpenAI)');
  assert.equal(agentWithVendor('unknown'), 'Unknown agent'); // no maker, no parentheses
});

test('authorDisplay: cleaned display name, login fallback, never "login (@login)"', () => {
  assert.equal(authorDisplay({ login: 'octocat', name: 'Mona Lisa' }), 'Mona Lisa');
  assert.equal(authorDisplay({ login: 'octocat', name: null }), 'octocat');
  assert.equal(authorDisplay({ login: 'octocat', name: '  \u0007 ' }), 'octocat'); // control char + spaces → empty
  assert.equal(authorDisplay({ login: 'octocat', name: 'OctoCat' }), 'octocat'); // same as the login, any case
  assert.equal(authorDisplay({ login: 'octocat', name: 'Mona\n  Lisa\tHamilton' }), 'Mona Lisa Hamilton');
  assert.equal(Array.from(authorDisplay({ login: 'x', name: 'a'.repeat(80) })).length, 40);
  assert.equal(authorLabel({ login: 'octocat', name: 'Mona Lisa' }), 'Mona Lisa (@octocat)');
  assert.equal(authorLabel({ login: 'octocat' }), '@octocat');
});

test('flightTitle: PR title first, then agent, maker and author; the repo is the first thing dropped', () => {
  const author = { login: 'janedoe', name: 'Jane Doe' };
  assert.equal(
    flightTitle({ prTitle: 'Add memory limit', agent: 'claude-code', repoFullName: 'jamsocket/forevervm', author }),
    'Add memory limit — Claude Code (Anthropic) pull request by Jane Doe in jamsocket/forevervm',
  );
  // Login only when no name is known.
  assert.equal(
    flightTitle({ prTitle: 'Add memory limit', agent: 'openai-codex', repoFullName: 'acme/widget', author: { login: 'octocat' } }),
    'Add memory limit — OpenAI Codex (OpenAI) pull request by octocat in acme/widget',
  );
  // Long PR title: clamped to 40, and the repo goes before anything else does.
  const long = flightTitle({
    prTitle: 'Refactor the entire ingestion pipeline to support incremental backfills and retries',
    agent: 'claude-code', repoFullName: 'some-organisation/a-rather-long-repository-name', author,
  });
  assert.ok(Array.from(long).length <= 90, long);
  assert.ok(long.includes('Claude Code (Anthropic) pull request by Jane Doe'), long);
  assert.ok(!long.includes(' in some-organisation'), long);
  // A bot author is named as the bot, not as a person.
  assert.equal(
    flightTitle({ prTitle: 'Fix typo', agent: 'devin', repoFullName: 'acme/widget', author: { login: 'devin-ai-integration[bot]', is_bot: true } }),
    'Fix typo — Devin (Cognition) bot pull request in acme/widget',
  );
  assert.equal(flightH1Suffix('cursor', author), '— a Cursor (Anysphere) flight by Jane Doe');
  assert.equal(flightH1Suffix('github-copilot', { login: 'copilot', is_bot: true }), '— a GitHub Copilot (GitHub) bot flight');
});

test('flightAnswer: who, agent, repo, date, ending and the stored numbers — nothing computed', () => {
  const merged = flightAnswer({
    author: { login: 'janedoe', name: 'Jane Doe' }, agent: 'claude-code', repoFullName: 'acme/widget',
    openedAt: '2026-03-03T10:00:00Z', state: 'merged', outcome: 'merged_clean', hoursToMerge: 4.2,
    additions: 120, deletions: 30, filesChanged: 4, reviewCount: 2,
  });
  assert.equal(
    merged,
    'Jane Doe (@janedoe) opened this Claude Code (Anthropic) pull request in acme/widget on Mar 3, 2026; merged clean in 4.2 h: +120 −30, 4 files, 2 reviews.',
  );
  const burn = flightAnswer({
    author: { login: 'octocat' }, agent: 'openai-codex', repoFullName: 'acme/widget',
    openedAt: null, state: 'closed', outcome: 'burn', hoursToMerge: null,
    additions: null, deletions: null, filesChanged: 1, reviewCount: 1,
  });
  assert.equal(burn, '@octocat opened this OpenAI Codex (OpenAI) pull request in acme/widget; a burn — closed unmerged after human review: 1 file, 1 review.');
  const bot = flightAnswer({
    author: { login: 'claude[bot]', is_bot: true }, agent: 'claude-code', repoFullName: 'acme/widget',
    openedAt: '2026-03-03T10:00:00Z', state: 'merged', outcome: 'merged_after_rework', hoursToMerge: 30,
    additions: 10, deletions: 2, filesChanged: null, reviewCount: null, mergedBy: 'maintainer',
  });
  assert.equal(bot, 'The Claude Code bot (Anthropic) opened this pull request in acme/widget on Mar 3, 2026; merged after rework in 30 h, merged by @maintainer: +10 −2.');
});

test('flightDescription: author/agent/repo prefix, then the debrief cut at a sentence; the answer stands in without one', () => {
  const debrief = 'Claude Code adds a memory limit to the sandbox runner and wires the flag through the CLI. ' +
    'Two reviews land on the first round with no changes requested. The flight merges clean in four hours.';
  const d = flightDescription({ author: { login: 'janedoe', name: 'Jane Doe' }, agent: 'claude-code', repoFullName: 'acme/widget', debrief, answer: 'A.' });
  assert.ok(d.startsWith('Jane Doe’s Claude Code (Anthropic) PR in acme/widget: Claude Code adds a memory limit'), d);
  assert.ok(d.endsWith('.'), d); // a whole sentence, not a word-clamp with an ellipsis
  assert.ok(Array.from(d).length <= 155, String(d.length));
  assert.equal(flightDescription({ author: { login: 'o' }, agent: 'cursor', repoFullName: 'a/b', debrief: null, answer: 'The answer.' }), 'The answer.');
  const bot = flightDescription({ author: { login: 'claude[bot]', is_bot: true }, agent: 'claude-code', repoFullName: 'a/b', debrief: 'Short.', answer: 'x' });
  assert.equal(bot, 'Claude Code (Anthropic) bot PR in a/b: Short.');
});

test('repoTitle and repoAnswer: makers by flights, dropped from the end when the title would not fit', () => {
  const agents = [
    { agent: 'cursor', flights: 2, merge_rate: 0.5 },
    { agent: 'claude-code', flights: 12, merge_rate: 0.75 },
    { agent: 'openai-codex', flights: 5, merge_rate: null },
  ];
  // Three makers need 113 code points; at the default 90 only the busiest fits.
  assert.equal(
    repoTitle({ fullName: 'acme/widget', total: 19, agents }),
    'acme/widget: 19 AI coding-agent pull requests — Claude Code (Anthropic)',
  );
  assert.equal(
    repoTitle({ fullName: 'acme/widget', total: 19, agents, max: 120 }),
    'acme/widget: 19 AI coding-agent pull requests — Claude Code (Anthropic), OpenAI Codex (OpenAI), Cursor (Anysphere)',
  );
  // No maker fits: the head alone, never a half-cut maker.
  assert.equal(repoTitle({ fullName: 'acme/widget', total: 19, agents, max: 60 }), 'acme/widget: 19 AI coding-agent pull requests');
  assert.equal(repoTitle({ fullName: 'acme/widget', total: 1, agents: [] }), 'acme/widget: 1 AI coding-agent pull request');
  assert.equal(
    repoAnswer({ fullName: 'acme/widget', total: 19, stars: 1200, language: 'Rust', agents }),
    '19 pull requests opened by AI coding agents in acme/widget (★ 1,200, Rust): Claude Code (Anthropic) 12 (75% merged), OpenAI Codex (OpenAI) 5, Cursor (Anysphere) 2 (50% merged).',
  );
});

test('agentTitle, agentH1Suffix, agentAnswer carry product, maker and the stored totals', () => {
  const totals = { flights: 4812, repos: 390, merge_rate: 0.71, burn_rate: 0.09, median_hours_to_merge: 6.4 };
  assert.equal(agentTitle('claude-code', totals), 'Claude Code (Anthropic) pull requests on GitHub: 4,812 flights, 71% merged, 9% burned');
  assert.equal(agentH1Suffix('openai-codex'), '— OpenAI’s coding agent, on the record');
  assert.equal(
    agentAnswer('claude-code', totals),
    'Claude Code (Anthropic) has opened 4,812 public pull requests across 390 GitHub repositories in this corpus: 71% merged, 9% burned (closed unmerged after human review), median 6.4 h to merge.',
  );
});

test('safeNextPath allows only sign-in CTA surfaces', () => {
  assert.equal(safeNextPath('/logs/acme/widget/12/'), '/logs/acme/widget/12/');
  assert.equal(safeNextPath('/opt-out/'), '/opt-out/');
  assert.equal(safeNextPath('/logs/author/janedoe/'), '/logs/author/janedoe/');
  assert.equal(safeNextPath('/logs/author/JaneDoe/'), null); // author URLs are lowercase
  assert.equal(safeNextPath('/logs/author/jane.doe/'), null);
  assert.equal(safeNextPath('/me/flights/'), '/me/flights/');
  assert.equal(safeNextPath('/logs/acme/widget/12/?x=1#y'), '/logs/acme/widget/12/');
  assert.equal(safeNextPath('https://evil.example/'), null);
  assert.equal(safeNextPath('//evil.example/'), null);
  assert.equal(safeNextPath('/admin/'), null);
  assert.equal(safeNextPath('/logs/acme/widget/12'), null); // unslashed form never issued
  assert.equal(safeNextPath(null), null);
});

test('flight JSON-LD: author is the GitHub account as a Person; about is the repository and the agent', () => {
  const node = flightArticle({
    headline: 'T — Claude Code (Anthropic) pull request by Mona Lisa in acme/widget',
    description: 'd',
    path: '/logs/acme/widget/12/',
    author: { login: 'octocat', name: 'Mona Lisa', url: '/logs/author/octocat/', sameAs: ['https://mona.example'] },
    repoFullName: 'acme/widget',
    prUrl: 'https://github.com/acme/widget/pull/12',
    agent: { product: 'Claude Code', vendor: 'Anthropic', vendorUrl: 'https://www.anthropic.com/', productUrl: 'https://www.anthropic.com/claude-code', path: '/logs/agent/claude-code/' },
    keywords: ['Claude Code', 'Anthropic'],
  }) as Record<string, any>;
  assert.equal(node.author.name, 'Mona Lisa');
  assert.equal(node.author.alternateName, '@octocat');
  assert.equal(node.author.url, 'https://agentriders.com/logs/author/octocat/');
  assert.deepEqual(node.author.sameAs, ['https://github.com/octocat', 'https://mona.example']);
  assert.equal(node.about[0]['@type'], 'SoftwareSourceCode');
  assert.equal(node.about[0].codeRepository, 'https://github.com/acme/widget');
  // The agent is nested under about, never a top-level SoftwareApplication, with the agent page's stable @id.
  assert.equal(node.about[1]['@type'], 'SoftwareApplication');
  assert.equal(node.about[1]['@id'], 'https://agentriders.com/logs/agent/claude-code/#agent');
  assert.deepEqual(node.about[1].publisher, { '@type': 'Organization', name: 'Anthropic', url: 'https://www.anthropic.com/' });
  assert.equal(node.url, 'https://agentriders.com/logs/acme/widget/12/');
  // Login-only author: the name is the login and nothing is invented.
  const bare = flightArticle({
    headline: 'T', description: 'd', path: '/logs/acme/widget/13/',
    author: { login: 'octocat' }, repoFullName: 'acme/widget', prUrl: 'https://github.com/acme/widget/pull/13',
  }) as Record<string, any>;
  assert.equal(bare.author.name, 'octocat');
  assert.ok(!('url' in bare.author));
  assert.equal(bare.about.length, 1);
});

test('author builders: name and login first, makers by flights, bio-led description', () => {
  const a = { login: 'janedoe', name: 'Jane Doe' };
  const totals = { flights: 14, indexed: 9, merged: 10, burns: 1, repos: 3, merge_rate: 0.77, burn_rate: 0.08, last_flight_at: null };
  const agents = [{ agent: 'openai-codex', flights: 2 }, { agent: 'claude-code', flights: 12 }];
  // Two makers need 103 code points; at the default 90 only the busiest fits.
  assert.equal(
    authorTitle(a, totals, agents),
    'Jane Doe (@janedoe): 14 AI coding-agent pull requests with Claude Code (Anthropic)',
  );
  assert.equal(
    authorTitle(a, totals, agents, 110),
    'Jane Doe (@janedoe): 14 AI coding-agent pull requests with Claude Code (Anthropic), OpenAI Codex (OpenAI)',
  );
  assert.equal(authorTitle({ login: 'octocat' }, { ...totals, flights: 1 }, [], 90), '@octocat: 1 AI coding-agent pull request');
  assert.equal(authorH1Suffix('janedoe'), '— @janedoe’s agent flight log');
  const answer = authorAnswer(a, totals, agents);
  assert.equal(
    answer,
    'Jane Doe has opened 14 pull requests with AI coding agents across 3 public GitHub repositories (Claude Code (Anthropic) 12, OpenAI Codex (OpenAI) 2); 77% merged, 1 burn.',
  );
  const withBio = authorDescription(a, 'Builds sandboxes for agents', answer);
  assert.ok(withBio.startsWith('Jane Doe (@janedoe) — Builds sandboxes for agents.'), withBio);
  assert.ok(Array.from(withBio).length <= 155);
  // No bio: the answer, clamped to the description budget.
  assert.equal(authorDescription(a, null, 'A short answer.'), 'A short answer.');
  assert.ok(Array.from(authorDescription(a, null, answer)).length <= 155);
});
