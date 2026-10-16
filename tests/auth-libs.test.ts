// Unit tests for the pure auth libs, run by `node --test` with Node's
// built-in type stripping. Only import modules with no Astro imports.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { randomToken, sha256Hex } from '../src/lib/crypto.ts';
import { validateHandle, isPendingHandle, HANDLE_REGEX } from '../src/lib/handles.ts';
import { rateLimit } from '../src/lib/ratelimit.ts';

test('randomToken: length, charset, uniqueness', () => {
  const token = randomToken();
  assert.equal(token.length, 32);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
  assert.equal(randomToken(16).length, 16);
  assert.notEqual(randomToken(), randomToken());
});

test('sha256Hex: known vector', async () => {
  assert.equal(
    await sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});

test('handles: accepts valid shapes', () => {
  for (const handle of ['max', 'a', '7', 'a-b-c', 'rider-42', 'x'.repeat(32)]) {
    assert.deepEqual(validateHandle(handle), { ok: true }, handle);
  }
});

test('handles: rejects bad shapes', () => {
  for (const handle of ['', '-a', 'a-', 'Max', 'a_b', 'a b', 'x'.repeat(33), 'émile']) {
    assert.equal(validateHandle(handle).ok, false, handle);
  }
});

test('handles: rejects reserved and pending-prefixed', () => {
  for (const handle of ['admin', 'api', 'riders', 'me', 'agentriders', 'wingleader', 'ranks', 'verified-flight', 'glossary', 'burns', 'data', 'kit', 'mounts', 'sitemap', 'rss']) {
    assert.equal(validateHandle(handle).ok, false, handle);
  }
  assert.equal(validateHandle('pending-abc123').ok, false);
  assert.ok(isPendingHandle('pending-abc123'));
  assert.ok(!isPendingHandle('abc-pending'));
});

test('handles: regex itself would allow pending-*, validateHandle must not', () => {
  assert.ok(HANDLE_REGEX.test('pending-abc123'));
  assert.equal(validateHandle('pending-abc123').ok, false);
});

function fakeKv() {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
  };
}

test('rateLimit: allows up to max, then blocks', async () => {
  const kv = fakeKv();
  for (let i = 0; i < 3; i++) assert.equal(await rateLimit(kv, 'k', 3, 3600), true);
  assert.equal(await rateLimit(kv, 'k', 3, 3600), false);
  assert.equal(await rateLimit(kv, 'other', 3, 3600), true);
});
