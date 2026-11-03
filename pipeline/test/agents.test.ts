import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aidevAgentToSlug, avatarUrl, detectSignals, isBotLogin, signalsFromCommitMessage } from '../src/agents.ts';

test('AIDev agent labels map to slugs', () => {
  assert.equal(aidevAgentToSlug('OpenAI_Codex'), 'openai-codex');
  assert.equal(aidevAgentToSlug('Copilot'), 'github-copilot');
  assert.equal(aidevAgentToSlug('Devin'), 'devin');
  assert.equal(aidevAgentToSlug('Cursor'), 'cursor');
  assert.equal(aidevAgentToSlug('Claude_Code'), 'claude-code');
  assert.equal(aidevAgentToSlug('SomethingNew'), 'unknown');
});

test('a PR with no signal is not a flight', () => {
  assert.equal(detectSignals({ authorLogin: 'octocat', headRef: 'fix/null-deref', commitMessages: ['fix it'] }), null);
});

test('devin bot author alone is a medium-confidence flight', () => {
  const d = detectSignals({ authorLogin: 'devin-ai-integration[bot]', headRef: 'devin/123-fix' });
  assert.equal(d?.agent, 'devin');
  assert.equal(d?.confidence, 'medium');
  assert.deepEqual(d?.signals, ['author:devin-ai-integration[bot]']);
});

test('branch prefix alone is low confidence (stored, not indexed)', () => {
  const d = detectSignals({ authorLogin: 'human-dev', headRef: 'codex/add-tests' });
  assert.equal(d?.agent, 'openai-codex');
  assert.equal(d?.confidence, 'low');
});

test('two signals make high confidence', () => {
  const d = detectSignals({ authorLogin: 'Copilot', headRef: 'copilot/fix-ci' });
  assert.equal(d?.agent, 'github-copilot');
  assert.equal(d?.confidence, 'high');
  assert.equal(d?.signals.length, 2);
});

test('claude trailer in a commit is a medium signal; trailer + branch is high', () => {
  const message = 'Fix the thing\n\nCo-Authored-By: Claude <noreply@anthropic.com>';
  const one = detectSignals({ authorLogin: 'human', headRef: 'main-fix', commitMessages: [message] });
  assert.equal(one?.agent, 'claude-code');
  assert.equal(one?.confidence, 'medium');
  const two = detectSignals({ authorLogin: 'human', headRef: 'claude/fix-123', commitMessages: [message] });
  assert.equal(two?.agent, 'claude-code');
  assert.equal(two?.confidence, 'high');
});

test('cursor co-author and branch', () => {
  const d = detectSignals({
    authorLogin: 'human',
    headRef: 'cursor/polish',
    commitMessages: ['polish\n\nCo-authored-by: Cursor Agent <cursoragent@cursor.com>'],
  });
  assert.equal(d?.agent, 'cursor');
  assert.equal(d?.confidence, 'high');
});

test('the strongest agent wins mixed signals', () => {
  // Copilot author + claude branch: author is the stronger (agent-written) signal.
  const d = detectSignals({ authorLogin: 'copilot-swe-agent[bot]', headRef: 'claude/x' });
  assert.equal(d?.agent, 'github-copilot');
});

test('commit-message signal scan', () => {
  assert.deepEqual(signalsFromCommitMessage('nothing here'), []);
  assert.deepEqual(
    signalsFromCommitMessage('x\n\nCo-Authored-By: Claude <noreply@anthropic.com>'),
    ['trailer:claude'],
  );
});

test('avatar URLs are constructed, never fetched', () => {
  assert.equal(avatarUrl(583231), 'https://avatars.githubusercontent.com/u/583231?v=4');
});

test('bot logins', () => {
  assert.ok(isBotLogin('devin-ai-integration[bot]'));
  assert.ok(isBotLogin('Copilot'));
  assert.ok(!isBotLogin('octocat'));
});
