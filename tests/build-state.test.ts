import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchSiteState, riderLink, isVerified } from '../src/lib/build-state.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.SITE_STATE_ORIGIN;
});

test('riderLink: links only real claimed handles', () => {
  const state = { handles: new Set(['maxfain', 'rhea']), verified: {} };
  assert.equal(riderLink('maxfain', state), '/riders/maxfain');
  assert.equal(riderLink('handle', state), null); // legacy placeholder
  assert.equal(riderLink('example', state), null);
});

test('isVerified: true only for slugs in the verified map', () => {
  const state = { handles: new Set<string>(), verified: { 'some-log': true } as Record<string, true> };
  assert.equal(isVerified('some-log', state), true);
  assert.equal(isVerified('other-log', state), false);
});

test('fetchSiteState: parses a populated response', async () => {
  process.env.SITE_STATE_ORIGIN = 'http://fixture.local';
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ handles: ['maxfain'], verified: { 'a-log': true } }), {
      status: 200,
    })) as typeof fetch;
  const state = await fetchSiteState();
  assert.ok(state.handles.has('maxfain'));
  assert.equal(state.verified['a-log'], true);
  assert.equal(riderLink('maxfain', state), '/riders/maxfain');
});

test('fetchSiteState: falls back to empty on a failed fetch (deploys never break)', async () => {
  process.env.SITE_STATE_ORIGIN = 'http://fixture.local';
  globalThis.fetch = (async () => {
    throw new Error('network down');
  }) as typeof fetch;
  const state = await fetchSiteState();
  assert.equal(state.handles.size, 0);
  assert.deepEqual(state.verified, {});
});

test('fetchSiteState: falls back to empty on a non-200', async () => {
  process.env.SITE_STATE_ORIGIN = 'http://fixture.local';
  globalThis.fetch = (async () => new Response('nope', { status: 503 })) as typeof fetch;
  const state = await fetchSiteState();
  assert.equal(state.handles.size, 0);
});
