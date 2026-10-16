import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchSiteState, riderLink, isVerified, loggedRiders } from '../src/lib/build-state.ts';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.SITE_STATE_ORIGIN;
});

test('riderLink: links only real claimed handles, with the trailing slash', () => {
  const state = { handles: new Set(['maxfain', 'rhea']), verified: {}, profiles: [] };
  assert.equal(riderLink('maxfain', state), '/riders/maxfain/');
  assert.equal(riderLink('handle', state), null); // legacy placeholder
  assert.equal(riderLink('example', state), null);
});

test('loggedRiders: newest activity first, capped, never mutates the state', () => {
  const profile = (handle: string, day: number) => ({ handle, flights: 1, updated: `2026-10-${String(day).padStart(2, '0')}T00:00:00.000Z` });
  const profiles = [profile('old', 1), profile('new', 16), profile('mid', 9)];
  const state = { handles: new Set<string>(), verified: {}, profiles };
  assert.deepEqual(loggedRiders(state).map((p) => p.handle), ['new', 'mid', 'old']);
  assert.deepEqual(loggedRiders(state, 2).map((p) => p.handle), ['new', 'mid']);
  assert.deepEqual(profiles.map((p) => p.handle), ['old', 'new', 'mid']); // input order untouched
  assert.deepEqual(loggedRiders({ handles: new Set<string>(), verified: {}, profiles: [] }), []);
  const many = Array.from({ length: 25 }, (_, i) => profile(`r${i}`, (i % 28) + 1));
  assert.equal(loggedRiders({ handles: new Set<string>(), verified: {}, profiles: many }).length, 20);
});

test('isVerified: true only for slugs in the verified map', () => {
  const state = { handles: new Set<string>(), verified: { 'some-log': true } as Record<string, true>, profiles: [] };
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
  assert.equal(riderLink('maxfain', state), '/riders/maxfain/');
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

test('fetchSiteState: a hung endpoint aborts on the timeout and falls back to empty', async () => {
  process.env.SITE_STATE_ORIGIN = 'http://fixture.local';
  // A reachable endpoint that never responds: the returned promise settles
  // only when the request's own AbortSignal fires. Without the timeout the
  // build would hang here; with it, the signal aborts and we fall back. The
  // keep-alive timer stands in for the live socket that keeps the event loop
  // running in a real build (AbortSignal.timeout's own timer is unref'd).
  globalThis.fetch = ((_url: string, opts: { signal: AbortSignal }) =>
    new Promise((_resolve, reject) => {
      const keepAlive = setTimeout(() => reject(new Error('mock never responded')), 10_000);
      opts.signal.addEventListener('abort', () => {
        clearTimeout(keepAlive);
        reject(opts.signal.reason ?? new Error('aborted'));
      });
    })) as typeof fetch;
  const state = await fetchSiteState(15);
  assert.equal(state.handles.size, 0);
  assert.deepEqual(state.verified, {});
  assert.deepEqual(state.profiles, []);
});
