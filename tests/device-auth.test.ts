// Device-signature auth: the CLI/MCP signedFetch client must round-trip with
// the server resolveDeviceAuth, and every tamper/replay/revocation must fail.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { signedFetch } from '../cli/lib/api.js';
import { resolveDeviceAuth } from '../src/lib/device-auth.ts';

function makeKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string };
  const publicKeyB64 = Buffer.from(jwk.x, 'base64url').toString('base64');
  const fingerprint = crypto.createHash('sha256').update(Buffer.from(publicKeyB64, 'base64')).digest('hex');
  return {
    publicKeyB64,
    fingerprint,
    sign: (m: string) => crypto.sign(null, Buffer.from(m, 'utf8'), privateKey).toString('base64'),
  };
}

// Capture the Request signedFetch builds (by stubbing fetch), as a real Request.
async function buildSignedRequest(opts: {
  keypair: ReturnType<typeof makeKeypair>;
  method: string;
  path: string;
  body?: unknown;
  atEpoch?: number; // override Date.now while signing (skew tests)
}) {
  let captured: { u: string; init: RequestInit } | undefined;
  const origFetch = globalThis.fetch;
  const origNow = Date.now;
  if (opts.atEpoch) Date.now = () => opts.atEpoch! * 1000;
  globalThis.fetch = (async (u: string, init: RequestInit) => {
    captured = { u, init };
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try {
    await signedFetch({ baseUrl: 'https://x.test', method: opts.method, path: opts.path, body: opts.body, keypair: opts.keypair });
  } finally {
    globalThis.fetch = origFetch;
    Date.now = origNow;
  }
  const req = new Request(captured!.u, captured!.init);
  return { req, url: new URL(captured!.u) };
}

type DeviceStub = { rider_id: string; public_key: string; revoked_at: string | null } | null;
type RiderStub = Record<string, unknown> | null;

function makeEnv(device: DeviceStub, rider: RiderStub) {
  const kv = new Map<string, string>();
  return {
    RATE: {
      get: async (k: string) => (kv.has(k) ? kv.get(k)! : null),
      put: async (k: string, v: string) => void kv.set(k, v),
    },
    DB: {
      prepare(sql: string) {
        return {
          bind() {
            return {
              first: async () => (sql.includes('FROM devices') ? device : sql.includes('FROM riders') ? rider : null),
            };
          },
        };
      },
    },
  } as unknown as AgentRidersEnv;
}

const rider = (over: Record<string, unknown> = {}) => ({
  id: 'rider-1', handle: 'pilot', display_name: 'Pilot', bio: null,
  rank: 'rider', is_admin: 0, banned_at: null, created_at: '2026-01-01T00:00:00Z', ...over,
});

test('a signedFetch request resolves to the rider', async () => {
  const kp = makeKeypair();
  const env = makeEnv({ rider_id: 'rider-1', public_key: kp.publicKeyB64, revoked_at: null }, rider());
  const { req, url } = await buildSignedRequest({ keypair: kp, method: 'POST', path: '/api/submissions', body: { title: 'x' } });
  const got = await resolveDeviceAuth(env, req, url);
  assert.equal(got?.id, 'rider-1');
  assert.equal(got?.handle, 'pilot');
});

test('GET with no body resolves (sha256 of empty body)', async () => {
  const kp = makeKeypair();
  const env = makeEnv({ rider_id: 'rider-1', public_key: kp.publicKeyB64, revoked_at: null }, rider());
  const { req, url } = await buildSignedRequest({ keypair: kp, method: 'GET', path: '/api/me' });
  assert.equal((await resolveDeviceAuth(env, req, url))?.id, 'rider-1');
});

test('a replayed nonce is rejected on the second use', async () => {
  const kp = makeKeypair();
  const env = makeEnv({ rider_id: 'rider-1', public_key: kp.publicKeyB64, revoked_at: null }, rider());
  const { req, url } = await buildSignedRequest({ keypair: kp, method: 'POST', path: '/api/submissions', body: { a: 1 } });
  assert.ok(await resolveDeviceAuth(env, req.clone(), url)); // first use
  assert.equal(await resolveDeviceAuth(env, req.clone(), url), null); // replay
});

test('a tampered body fails verification', async () => {
  const kp = makeKeypair();
  const env = makeEnv({ rider_id: 'rider-1', public_key: kp.publicKeyB64, revoked_at: null }, rider());
  const { url } = await buildSignedRequest({ keypair: kp, method: 'POST', path: '/api/submissions', body: { a: 1 } });
  // Re-sign nothing; rebuild a request with the SAME headers but a different body.
  const signed = await buildSignedRequest({ keypair: kp, method: 'POST', path: '/api/submissions', body: { a: 1 } });
  const headers = new Headers(signed.req.headers);
  const tampered = new Request(signed.url.href, { method: 'POST', headers, body: JSON.stringify({ a: 2 }) });
  assert.equal(await resolveDeviceAuth(env, tampered, url), null);
});

test('clock skew beyond 300s is rejected', async () => {
  const kp = makeKeypair();
  const env = makeEnv({ rider_id: 'rider-1', public_key: kp.publicKeyB64, revoked_at: null }, rider());
  const stale = Math.floor(Date.now() / 1000) - 600;
  const { req, url } = await buildSignedRequest({ keypair: kp, method: 'POST', path: '/api/submissions', body: { a: 1 }, atEpoch: stale });
  assert.equal(await resolveDeviceAuth(env, req, url), null);
});

test('a revoked device and a banned rider are rejected', async () => {
  const kp = makeKeypair();
  const revoked = makeEnv({ rider_id: 'rider-1', public_key: kp.publicKeyB64, revoked_at: '2026-02-01T00:00:00Z' }, rider());
  const banned = makeEnv({ rider_id: 'rider-1', public_key: kp.publicKeyB64, revoked_at: null }, rider({ banned_at: '2026-02-01T00:00:00Z' }));
  const a = await buildSignedRequest({ keypair: kp, method: 'POST', path: '/api/submissions', body: { a: 1 } });
  const b = await buildSignedRequest({ keypair: kp, method: 'POST', path: '/api/submissions', body: { a: 1 } });
  assert.equal(await resolveDeviceAuth(revoked, a.req, a.url), null);
  assert.equal(await resolveDeviceAuth(banned, b.req, b.url), null);
});

// A body past the 64 KiB device-auth budget is refused without being
// buffered — declared, or chunked with no Content-Length to judge it by.
test('an oversized body is refused before it is buffered', async () => {
  const kp = makeKeypair();
  const env = makeEnv({ rider_id: 'rider-1', public_key: kp.publicKeyB64, revoked_at: null }, rider());
  const { req, url } = await buildSignedRequest({ keypair: kp, method: 'POST', path: '/api/submissions', body: { a: 1 } });
  const headers = new Headers(req.headers);

  headers.set('Content-Length', String(64 * 1024 + 1));
  const declared = new Request(url.href, { method: 'POST', headers, body: '{"a":1}' });
  assert.equal(await resolveDeviceAuth(env, declared, url), null);

  headers.delete('Content-Length');
  let pulled = 0;
  const chunk = new TextEncoder().encode('x'.repeat(32 * 1024));
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled < 16) { pulled++; controller.enqueue(chunk); } else controller.close();
    },
  });
  const chunked = new Request(url.href, { method: 'POST', headers, body: stream, duplex: 'half' } as RequestInit);
  assert.equal(chunked.headers.get('Content-Length'), null);
  assert.equal(await resolveDeviceAuth(env, chunked, url), null);
  // 32 + 32 KiB is at the cap and the third chunk crosses it; what follows
  // is the stream machinery's own read-ahead (a chunk or two through the
  // tee), so of the 512 KiB on offer at least half is never pulled.
  assert.ok(pulled <= 8, `pulled ${pulled} chunks`);
});

test('an unknown device and a non-device request are rejected', async () => {
  const kp = makeKeypair();
  const env = makeEnv(null, null);
  const { req, url } = await buildSignedRequest({ keypair: kp, method: 'POST', path: '/api/submissions', body: { a: 1 } });
  assert.equal(await resolveDeviceAuth(env, req, url), null);
  // A plain request with no AR headers.
  const plain = new Request('https://x.test/api/me');
  assert.equal(await resolveDeviceAuth(makeEnv({ rider_id: 'r', public_key: kp.publicKeyB64, revoked_at: null }, rider()), plain, new URL('https://x.test/api/me')), null);
});
