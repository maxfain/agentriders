import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateProfileInput,
  githubLinkFresh,
  GITHUB_FRESH_DAYS,
  LINKISH,
  type ProfilePatch,
} from '../src/lib/profile.ts';

// Pure validation for PUT /api/me/profile. readProfileExtras is a D1 read,
// exercised by the live e2e (including the pre-migration fallback).

const withLogin = { hasGithubLogin: true };
const noLogin = { hasGithubLogin: false };

function ok(body: unknown, ctx = noLogin): ProfilePatch {
  const r = validateProfileInput(body, ctx);
  if (!r.ok) assert.fail(`expected ok, got "${r.error}" for ${JSON.stringify(body)}`);
  return r.patch;
}
function err(body: unknown, ctx = noLogin): string {
  const r = validateProfileInput(body, ctx);
  if (r.ok) assert.fail(`expected an error for ${JSON.stringify(body)}`);
  return r.error;
}

test('validateProfileInput: body must be a JSON object; unknown keys ignored; missing keys unchanged', () => {
  for (const body of [null, undefined, [], 'x', 42, true]) assert.equal(err(body), 'Send JSON.');
  assert.deepEqual(ok({}), {});
  assert.deepEqual(ok({ foo: 1, handle: 'nope', is_admin: 1 }), {});
  assert.deepEqual(ok({ bio: 'Just this.' }), { bio: 'Just this.' });
});

test('validateProfileInput: displayName strips controls and angle brackets, trims, 1–60', () => {
  assert.deepEqual(ok({ displayName: '  Max  ' }), { display_name: 'Max' });
  assert.deepEqual(ok({ displayName: '<b>Max</b>\u0001\u001f' }), { display_name: 'bMax/b' });
  assert.deepEqual(ok({ displayName: 'x'.repeat(60) }), { display_name: 'x'.repeat(60) });
  for (const bad of ['', '   ', '<>', 'x'.repeat(61), 42, null, ['Max']]) {
    assert.equal(err({ displayName: bad }), 'Display name: 1 to 60 characters.', JSON.stringify(bad));
  }
});

test('validateProfileInput: bio collapses to one line, empty → null, 160 max', () => {
  assert.deepEqual(ok({ bio: null }), { bio: null });
  assert.deepEqual(ok({ bio: '' }), { bio: null });
  assert.deepEqual(ok({ bio: '  \n\t ' }), { bio: null });
  assert.deepEqual(ok({ bio: 'line one\n\nline two\t end \u0000' }), { bio: 'line one line two end' });
  assert.deepEqual(ok({ bio: 'x'.repeat(160) }), { bio: 'x'.repeat(160) });
  assert.equal(err({ bio: 'x'.repeat(161) }), 'One line, 160 characters at most.');
  assert.equal(err({ bio: 42 }), 'One line, 160 characters at most.');
  assert.equal(err({ bio: ['a'] }), 'One line, 160 characters at most.');
});

test('validateProfileInput: bio refuses links, allows dotted prose', () => {
  for (const bad of ['see example.com', 'https://x.y', 'www.example', 'ftp://host', 'me at foo.dev ok', 'EXAMPLE.IO']) {
    assert.equal(err({ bio: bad }), 'Links go in your flights, not your bio.', bad);
  }
  assert.deepEqual(ok({ bio: 'Ships Node.js tools, e.g. CLIs.' }), { bio: 'Ships Node.js tools, e.g. CLIs.' });
  // the editor's placeholder must pass its own validator
  const placeholder = 'Ships billing code with Claude Code. Runs a lead-triage agent on n8n.';
  assert.deepEqual(ok({ bio: placeholder }), { bio: placeholder });
  assert.deepEqual(ok({ bio: 'v4.1 shipped. Next: v4.2' }), { bio: 'v4.1 shipped. Next: v4.2' });
});

test('validateProfileInput: mounts resolve to the catalogue, keep free text, dedupe by slug', () => {
  assert.deepEqual(ok({ mounts: ['Cursor'] }), { mounts: [{ slug: 'cursor', name: 'Cursor' }] });
  assert.deepEqual(ok({ mounts: [] }), { mounts: [] });
  // alias and case variants collapse onto one catalogue entry
  assert.deepEqual(ok({ mounts: ['cc'] }), { mounts: [{ slug: 'claude-code', name: 'Claude Code' }] });
  assert.deepEqual(ok({ mounts: ['Claude Code', 'claude code', 'cc', 'claude-code-cli', 'CLAUDE CODE'] }), {
    mounts: [{ slug: 'claude-code', name: 'Claude Code' }],
  });
  assert.deepEqual(ok({ mounts: ['VS Code'] }), { mounts: [{ slug: 'vs-code', name: 'VS Code' }] });
  assert.deepEqual(ok({ mounts: ['vscode'] }), { mounts: [{ slug: 'vs-code', name: 'VS Code' }] });
  // a slug is accepted as its own name (chips may send slugs)
  assert.deepEqual(ok({ mounts: ['github-copilot'] }), { mounts: [{ slug: 'github-copilot', name: 'GitHub Copilot' }] });
  // the record's own spelling keeps its slug and its text as typed (cleaned)
  assert.deepEqual(ok({ mounts: ['  n8n +  Claude '] }), { mounts: [{ slug: 'n8n-claude', name: 'n8n + Claude' }] });
  assert.deepEqual(ok({ mounts: ['my Bespoke agent'] }), { mounts: [{ slug: 'my-bespoke-agent', name: 'my Bespoke agent' }] });
  // a catalogued name that reads like a domain is still ours to show
  assert.deepEqual(ok({ mounts: ['Claude.ai'] }), { mounts: [{ slug: 'claude-ai', name: 'Claude.ai' }] });
  // order is the rider's
  assert.deepEqual(
    ok({ mounts: ['Aider', 'Cursor', 'Aider'] }).mounts?.map((m) => m.slug),
    ['aider', 'cursor'],
  );
});

test('validateProfileInput: mounts cap at eight, and each must be a product name', () => {
  const eight = ['Cursor', 'Aider', 'Cline', 'Kiro', 'Devin', 'Jules', 'n8n', 'Zapier'];
  assert.equal(ok({ mounts: eight }).mounts?.length, 8);
  assert.equal(err({ mounts: [...eight, 'Make'] }), 'Eight mounts is plenty.');
  for (const bad of ['@handle', 'x'.repeat(41), 'visit example.com', '-leading', '', '   ', 'a<b', 'foo.io', 'http://x', 'tab\there?']) {
    assert.equal(err({ mounts: [bad] }), 'A mount is a product name, not a link.', JSON.stringify(bad));
  }
  assert.equal(ok({ mounts: ['x'.repeat(40)] }).mounts?.[0].name, 'x'.repeat(40));
  assert.equal(err({ mounts: [42] }), 'A mount is a product name, not a link.');
  assert.equal(err({ mounts: [null] }), 'A mount is a product name, not a link.');
  assert.equal(err({ mounts: 'Cursor' }), 'Send JSON.');
  assert.equal(err({ mounts: { a: 1 } }), 'Send JSON.');
  // a bad entry anywhere in the list fails the whole save
  assert.equal(err({ mounts: ['Cursor', '@x'] }), 'A mount is a product name, not a link.');
});

test('validateProfileInput: githubPublic maps to 1/0 with a login, is dropped without one', () => {
  assert.deepEqual(ok({ githubPublic: true }, withLogin), { github_public: 1 });
  assert.deepEqual(ok({ githubPublic: false }, withLogin), { github_public: 0 });
  assert.deepEqual(ok({ githubPublic: true }, noLogin), {});
  assert.deepEqual(ok({ githubPublic: false }, noLogin), {});
  assert.equal(err({ githubPublic: 'yes' }, withLogin), 'Send JSON.');
  assert.equal(err({ githubPublic: 1 }, withLogin), 'Send JSON.');
  // dropped means dropped — not even inspected
  assert.deepEqual(ok({ githubPublic: 'yes' }, noLogin), {});
});

test('validateProfileInput: a full body yields a full patch, in the column whitelist only', () => {
  const patch = ok(
    { displayName: 'Max', bio: 'Flies billing code.', mounts: ['Claude Code', 'n8n + Claude'], githubPublic: false, rank: 'wingleader' },
    withLogin,
  );
  assert.deepEqual(Object.keys(patch).sort(), ['bio', 'display_name', 'github_public', 'mounts']);
  assert.deepEqual(patch, {
    display_name: 'Max',
    bio: 'Flies billing code.',
    github_public: 0,
    mounts: [
      { slug: 'claude-code', name: 'Claude Code' },
      { slug: 'n8n-claude', name: 'n8n + Claude' },
    ],
  });
});

test('githubLinkFresh: inside the 180-day window only; null or garbage is never fresh', () => {
  assert.equal(GITHUB_FRESH_DAYS, 180);
  const now = Date.parse('2026-10-20T12:00:00Z');
  const daysAgo = (d: number) => new Date(now - d * 86_400_000).toISOString();
  assert.equal(githubLinkFresh(daysAgo(0), now), true);
  assert.equal(githubLinkFresh(daysAgo(179), now), true);
  assert.equal(githubLinkFresh(daysAgo(180), now), true);
  assert.equal(githubLinkFresh(daysAgo(181), now), false);
  assert.equal(githubLinkFresh(daysAgo(400), now), false);
  assert.equal(githubLinkFresh(daysAgo(-1), now), true); // clock skew never hides a fresh link
  assert.equal(githubLinkFresh(null, now), false);
  assert.equal(githubLinkFresh('', now), false);
  assert.equal(githubLinkFresh('not a date', now), false);
  // default `now` is the wall clock
  assert.equal(githubLinkFresh(new Date().toISOString()), true);
});

test('LINKISH: schemes, www., and word.tld; not version numbers or file extensions', () => {
  for (const s of ['https://a.b', 'ftp://x', 'www.foo', 'foo.com', 'Foo.IO', 'a-b.dev', 'x.co']) assert.match(s, LINKISH, s);
  for (const s of ['Node.js', 'e.g.', 'v4.1', 'Claude Code', 'foo.txt', 'README.md', 'i.e. this']) assert.doesNotMatch(s, LINKISH, s);
});
