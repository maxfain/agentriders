// Verification pipeline: canonical JSON (shared with the CLI), Ed25519
// sign→verify, device fingerprint, payload validation, and server-side eval
// scoring. Run with `node --test`.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  canonicalize,
  deviceFingerprint,
  verifySignature,
  validatePayload,
  clampEvals,
  evalScore,
  recordHash,
  PAYLOAD_MAX_BYTES,
} from '../src/lib/verify.ts';
import { canonicalize as cliCanonicalize } from '../cli/lib/canonical.js';
import { scoreEvals, isScoreEligible, DEFAULT_CAPS } from '../cli/eval-detector.js';

const goodEvals = {
  eval_files_created: 2,
  eval_frameworks_detected: ['pytest'],
  eval_run_count: 3,
  eval_iteration_cycles: 1,
  pass_rate_delta: 0.5,
  workflows_with_evals: 1,
};

const goodPayload = () => ({
  v: 1,
  cc_session_hash: 'a'.repeat(64),
  started_at: '2026-10-16T10:00:00.000Z',
  ended_at: '2026-10-16T10:30:00.000Z',
  duration_seconds: 1800,
  models: ['claude-opus-4-8'],
  tool_call_counts: { Bash: 12, Edit: 5 },
  evals: { ...goodEvals },
  generated_at: '2026-10-16T10:31:00.000Z',
  cli_version: '0.1.0',
});

// --- canonical JSON --------------------------------------------------------

test('canonicalize sorts keys and is order-independent', () => {
  const a = canonicalize({ b: 1, a: 2, c: [3, { y: 1, x: 2 }] });
  const b = canonicalize({ c: [3, { x: 2, y: 1 }], a: 2, b: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"a":2,"b":1,"c":[3,{"x":2,"y":1}]}');
});

test('canonicalize drops undefined and rejects non-finite', () => {
  assert.equal(canonicalize({ a: 1, b: undefined }), '{"a":1}');
  assert.throws(() => canonicalize({ a: Infinity }));
  assert.throws(() => canonicalize(Number.NaN));
});

test('server and CLI canonicalize agree byte-for-byte', () => {
  const samples: unknown[] = [
    goodPayload(),
    { z: [1, 2, 3], a: 'x', nested: { deep: { k: true, j: null } } },
    { unicode: 'héllo ✦', quote: 'a"b', arr: [] },
    123,
    'string',
    null,
  ];
  for (const s of samples) assert.equal(canonicalize(s), cliCanonicalize(s));
});

// --- fingerprint + signature ----------------------------------------------

function makeKey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string };
  const pubB64 = Buffer.from(jwk.x, 'base64url').toString('base64');
  const sign = (msg: string) => crypto.sign(null, Buffer.from(msg, 'utf8'), privateKey).toString('base64');
  return { pubB64, sign };
}

test('deviceFingerprint is 64-hex and rejects wrong-length keys', async () => {
  const { pubB64 } = makeKey();
  const fp = await deviceFingerprint(pubB64);
  assert.match(fp, /^[0-9a-f]{64}$/);
  await assert.rejects(() => deviceFingerprint(Buffer.alloc(16).toString('base64')));
});

test('CLI-signed canonical payload verifies; tamper and wrong-key fail', async () => {
  const { pubB64, sign } = makeKey();
  const canonical = canonicalize(goodPayload());
  const sig = sign(canonical);

  assert.equal(await verifySignature(pubB64, sig, canonical), true);
  // Tampered message (e.g. a different duration) must fail.
  assert.equal(await verifySignature(pubB64, sig, canonical.replace('1800', '9999')), false);
  // A different key must fail.
  assert.equal(await verifySignature(makeKey().pubB64, sig, canonical), false);
  // Malformed inputs return false, never throw.
  assert.equal(await verifySignature('not-base64!!', sig, canonical), false);
  assert.equal(await verifySignature(pubB64, 'short', canonical), false);
});

test('full CLI key store signs a record the server verifies', async () => {
  // Exercise cli/lib/keys.js end-to-end in a temp home.
  const os = await import('node:os');
  const path = await import('node:path');
  const fs = await import('node:fs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-key-'));
  process.env.AGENTRIDERS_HOME = tmp;
  const { loadOrCreateKey } = await import('../cli/lib/keys.js');
  const key = loadOrCreateKey();

  const canonical = canonicalize(goodPayload());
  const sig = key.sign(canonical);
  assert.equal(await verifySignature(key.publicKeyB64, sig, canonical), true);
  // Fingerprint from the key equals the server's derivation.
  assert.equal(await deviceFingerprint(key.publicKeyB64), key.fingerprint);
  delete process.env.AGENTRIDERS_HOME;
});

// --- payload validation ----------------------------------------------------

test('validatePayload accepts a well-formed record', () => {
  const r = validatePayload(goodPayload());
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.canonical, canonicalize(goodPayload()));
});

test('validatePayload rejects malformed records', () => {
  const bad: Array<[string, (p: Record<string, unknown>) => void]> = [
    ['version', (p) => (p.v = 2)],
    ['session hash', (p) => (p.cc_session_hash = 'xyz')],
    ['timestamp', (p) => (p.started_at = 'not-a-date')],
    ['ended before started', (p) => (p.ended_at = '2026-10-16T09:00:00.000Z')],
    ['negative duration', (p) => (p.duration_seconds = -1)],
    ['duration disagrees with timestamps', (p) => (p.duration_seconds = 10)],
    ['empty models', (p) => (p.models = [])],
    ['tool name', (p) => (p.tool_call_counts = { 'bad name!': 1 })],
    ['tool count', (p) => (p.tool_call_counts = { Bash: -3 })],
    ['evals shape', (p) => (p.evals = { eval_run_count: 'lots' })],
    ['cli version', (p) => (p.cli_version = 'v1')],
  ];
  for (const [label, mutate] of bad) {
    const p = goodPayload() as unknown as Record<string, unknown>;
    mutate(p);
    const r = validatePayload(p);
    assert.equal(r.ok, false, `expected rejection: ${label}`);
  }
});

test('validatePayload rejects too many tool entries', () => {
  const p = goodPayload() as unknown as { tool_call_counts: Record<string, number> };
  p.tool_call_counts = {};
  for (let i = 0; i < 61; i++) p.tool_call_counts[`Tool${i}`] = i; // > MAX_TOOLS
  assert.equal(validatePayload(p).ok, false);
});

test('a maximal in-bounds payload stays under the size cap', () => {
  // The per-field bounds are strict enough that a valid record is always well
  // under PAYLOAD_MAX_BYTES — the size cap is defense-in-depth, never a false
  // reject of a legitimate record.
  const p = goodPayload() as unknown as {
    models: string[];
    tool_call_counts: Record<string, number>;
    evals: { eval_frameworks_detected: string[] };
  };
  p.models = Array.from({ length: 20 }, (_, i) => `${'m'.repeat(118)}${i}`);
  p.tool_call_counts = {};
  for (let i = 0; i < 60; i++) p.tool_call_counts[`${'T'.repeat(56)}${i}`] = 999999;
  p.evals.eval_frameworks_detected = Array.from({ length: 20 }, (_, i) => `${'f'.repeat(38)}${i}`);
  const r = validatePayload(p);
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(new TextEncoder().encode(r.canonical).length < PAYLOAD_MAX_BYTES);
});

test('recordHash is stable per rider and differs across riders', async () => {
  const canon = canonicalize(goodPayload());
  const h = await recordHash('rider-1', canon);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, await recordHash('rider-1', canon));
  // Salting with the rider means two riders never collide on the same session.
  assert.notEqual(h, await recordHash('rider-2', canon));
});

test('low-order / identity Ed25519 public keys are rejected', async () => {
  const zero = Buffer.alloc(32).toString('base64');
  await assert.rejects(() => deviceFingerprint(zero));
  // Even a "valid-looking" all-zero signature must not verify under the key.
  assert.equal(await verifySignature(zero, Buffer.alloc(64).toString('base64'), '{"v":1,"x":"y"}'), false);
});

// --- eval scoring (server-authoritative) -----------------------------------

test('clampEvals caps file and cycle counts to DEFAULT_CAPS', () => {
  const c = clampEvals({
    ...goodEvals,
    eval_files_created: 9999,
    eval_iteration_cycles: 9999,
    eval_frameworks_detected: new Array(50).fill('x'),
  });
  assert.equal(c.eval_files_created, DEFAULT_CAPS.eval_files_created);
  assert.equal(c.eval_iteration_cycles, DEFAULT_CAPS.eval_iteration_cycles);
  assert.ok(c.eval_frameworks_detected.length <= 20);
});

test('evalScore matches scoreEvals on clamped signals, 0 without a run', () => {
  assert.equal(evalScore(goodEvals), scoreEvals(clampEvals(goodEvals)));
  const noRun = { ...goodEvals, eval_run_count: 0 };
  assert.equal(isScoreEligible(noRun), false);
  assert.equal(evalScore(noRun), 0);
  // A client can't inflate the score past the caps.
  const inflated = { ...goodEvals, eval_files_created: 1e6, eval_iteration_cycles: 1e6 };
  assert.equal(evalScore(inflated), scoreEvals(clampEvals(inflated)));
});
