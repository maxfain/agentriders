// The middleware's own body cap (src/middleware.ts onRequest): an oversized
// API write is refused with 413 and the full header set before any session
// or device-auth code runs; reads, OPTIONS, non-API writes and bodies at the
// limit pass through; a cross-origin write is still refused as 403 first.
// `astro:middleware` is served by tests/support/astro-stubs-loader.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';

import { onRequest } from '../src/middleware.ts';

const ORIGIN = 'https://agentriders.com';
const SECURITY = {
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000',
};

type Opts = { method: string; path: string; contentLength?: string; origin?: string | null; env?: unknown };

// A minimal APIContext. `env` defaults to a trap that throws on any access:
// the cap must answer before the middleware reaches `locals.runtime.env` for
// session resolution, so a 413 that never trips the trap proves the order.
function run(opts: Opts) {
  const headers = new Headers();
  if (opts.contentLength !== undefined) headers.set('Content-Length', opts.contentLength);
  if (opts.origin !== null) headers.set('Origin', opts.origin ?? ORIGIN);
  const request = new Request(ORIGIN + opts.path, { method: opts.method, headers });
  const env =
    opts.env ??
    new Proxy({}, { get(_t, prop) { throw new Error(`authentication reached: env.${String(prop)}`); } });
  let nextCalls = 0;
  const context = {
    request,
    url: new URL(request.url),
    isPrerendered: false,
    locals: { runtime: { env } } as Record<string, unknown>,
    cookies: { get: () => undefined, delete: () => {}, set: () => {} },
    redirect: (to: string, status = 302) => new Response(null, { status, headers: { Location: to } }),
  };
  const next = async () => { nextCalls += 1; return new Response('ok', { status: 200 }); };
  const response = (onRequest as unknown as (c: unknown, n: unknown) => Promise<Response>)(context, next);
  return { response, nextCalled: () => nextCalls };
}

const BIG = '307200'; // the 300 KiB probe
const LIMIT = '262144';

test('middleware: an oversized API write is a 413 before any authentication code runs', async () => {
  for (const [method, path] of [['PUT', '/api/me/profile'], ['POST', '/api/submissions'], ['POST', '/api/flight-records'], ['DELETE', '/api/devices/abc']]) {
    const { response, nextCalled } = run({ method, path, contentLength: BIG });
    const res = await response; // the env trap would have thrown here if auth ran first
    assert.equal(res.status, 413, `${method} ${path}`);
    assert.deepEqual(await res.json(), { error: 'Request body too large.' });
    assert.equal(res.headers.get('Content-Type'), 'application/json');
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
    for (const [name, value] of Object.entries(SECURITY)) assert.equal(res.headers.get(name), value, name);
    assert.equal(nextCalled(), 0);
  }
});

test('middleware: the cap is inclusive — a body at exactly the limit goes through', async () => {
  const { response, nextCalled } = run({ method: 'PUT', path: '/api/me/profile', contentLength: LIMIT, env: {} });
  assert.equal((await response).status, 200);
  assert.equal(nextCalled(), 1);
});

test('middleware: reads and OPTIONS are never capped', async () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    const { response, nextCalled } = run({ method, path: '/api/me', contentLength: BIG, env: {} });
    assert.equal((await response).status, 200, method);
    assert.equal(nextCalled(), 1, method);
  }
});

test('middleware: a non-API write with a huge Content-Length is not the cap’s business', async () => {
  const { response, nextCalled } = run({ method: 'POST', path: '/logs/new/', contentLength: BIG, env: {} });
  assert.equal((await response).status, 200);
  assert.equal(nextCalled(), 1);
});

test('middleware: a cross-origin oversized write is refused as cross-origin first', async () => {
  const { response, nextCalled } = run({ method: 'PUT', path: '/api/me/profile', contentLength: BIG, origin: 'https://evil.example' });
  const res = await response;
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'cross-origin request rejected' });
  assert.equal(nextCalled(), 0);
});
