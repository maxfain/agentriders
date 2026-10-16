// Flight-record verification: the server half of the `agentriders` CLI.
//
// A record is signed on the rider's machine with a device's Ed25519 key
// over the *canonical* JSON of a metadata-only payload. The server never
// sees the session's prompts, code, or file paths — only counts, model
// names, timestamps, and eval signals.
//
// What the signature proves — and what it does NOT. A valid signature proves
// that a device registered to a rider produced this record. It does NOT prove
// the metadata is true: every count, timestamp, and eval signal is produced on
// the rider's machine and is self-attested. The badge therefore means "a
// registered device signed this session metadata," nothing more. The eval
// *score* is recomputed here from the signed signals (clamped to the shared
// caps) so the client cannot claim an arbitrary NUMBER — but the underlying
// signals are still self-reported, so eval stats are display-only and MUST
// NOT feed rank.
//
// Erasable TypeScript: this file is imported directly by `node --test`, so
// it uses only Web-standard crypto (available in both Workers and Node 20+)
// and carries no runtime-only type syntax.

import { scoreEvals, isScoreEligible, DEFAULT_CAPS } from '../../cli/eval-detector.js';

// Canonical JSON over the signed payload must not exceed this once encoded.
export const PAYLOAD_MAX_BYTES = 16 * 1024;
export const PAYLOAD_VERSION = 1;

export type EvalSignals = {
  eval_files_created: number;
  eval_frameworks_detected: string[];
  eval_run_count: number;
  eval_iteration_cycles: number;
  pass_rate_delta: number | null;
  workflows_with_evals: number;
};

export type FlightPayload = {
  v: number;
  cc_session_hash: string;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  models: string[];
  tool_call_counts: Record<string, number>;
  evals: EvalSignals;
  generated_at: string;
  cli_version: string;
};

// --- Canonical JSON --------------------------------------------------------
// Deterministic serialization: object keys sorted, undefined dropped, no
// insignificant whitespace. The CLI (cli/lib/canonical.js) runs the IDENTICAL
// algorithm, so the bytes it signs are the bytes we hash and verify here. Any
// divergence would break every signature, so the two are pinned by the shared
// vectors in tests/verify.test.ts.
export function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'number') {
    if (!Number.isFinite(value as number)) throw new Error('non-finite number');
    return JSON.stringify(value);
  }
  if (t === 'boolean' || t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalize(v ?? null)).join(',')}]`;
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of Object.keys(obj).sort()) {
      if (obj[key] === undefined) continue;
      parts.push(`${JSON.stringify(key)}:${canonicalize(obj[key])}`);
    }
    return `{${parts.join(',')}}`;
  }
  throw new Error(`cannot canonicalize ${t}`);
}

// --- Byte / hash helpers ---------------------------------------------------

function b64ToBytes(b64: string): Uint8Array {
  // Standard base64 (not url). Throws on malformed input via atob.
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

const bytesToHex = (bytes: Uint8Array) =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

// Small-order / identity Ed25519 public keys (libsodium's blocklist plus the
// non-canonical high-bit encodings of the order-1/2/4 points). A device
// registered with one of these could "verify" forged signatures without a
// private key, so we refuse them at registration and at verify. An honestly
// generated key is a full-order point and never collides with this set.
const LOW_ORDER_ED25519 = new Set([
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0100000000000000000000000000000000000000000000000000000000000000',
  '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05',
  'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a',
  'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  'edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  'eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  '0000000000000000000000000000000000000000000000000000000000000080',
  'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
]);

async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return bytesToHex(new Uint8Array(digest));
}

export async function sha256Hex(input: string): Promise<string> {
  return sha256HexBytes(utf8(input));
}

/** A device's stable id: SHA-256 of its 32-byte raw Ed25519 public key. */
export async function deviceFingerprint(publicKeyB64: string): Promise<string> {
  const bytes = b64ToBytes(publicKeyB64);
  if (bytes.length !== 32) throw new Error('Ed25519 public key must be 32 bytes.');
  if (LOW_ORDER_ED25519.has(bytesToHex(bytes))) throw new Error('Low-order public key rejected.');
  return sha256HexBytes(bytes);
}

/**
 * Dedupe key for a record: SHA-256 of the rider id joined to the canonical
 * payload. Salting with the rider makes the hash per-rider even though the
 * column's UNIQUE index is global — so two riders who signed the same session
 * facts never collide (no cross-rider pre-emption), and the only 409 a rider
 * can provoke is against their OWN earlier upload of the exact same record.
 */
export async function recordHash(riderId: string, canonical: string): Promise<string> {
  return sha256Hex(`${riderId}:${canonical}`);
}

// --- Signature verification ------------------------------------------------
// WebCrypto Ed25519 is available in Cloudflare Workers and Node 20+. We import
// the raw 32-byte public key and verify the 64-byte signature over the UTF-8
// canonical bytes. Any malformed input returns false rather than throwing, so
// a bad request can never 500.
export async function verifySignature(
  publicKeyB64: string,
  signatureB64: string,
  message: string,
): Promise<boolean> {
  let pub: Uint8Array;
  let sig: Uint8Array;
  try {
    pub = b64ToBytes(publicKeyB64);
    sig = b64ToBytes(signatureB64);
  } catch {
    return false;
  }
  if (pub.length !== 32 || sig.length !== 64) return false;
  if (LOW_ORDER_ED25519.has(bytesToHex(pub))) return false;
  try {
    const key = await crypto.subtle.importKey('raw', pub, { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, sig, utf8(message));
  } catch {
    return false;
  }
}

// --- Payload validation ----------------------------------------------------

export type ValidationResult =
  | { ok: true; payload: FlightPayload; canonical: string }
  | { ok: false; reason: string };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const SESSION_HASH_RE = /^[0-9a-f]{64}$/;
const TOOL_NAME_RE = /^[A-Za-z0-9_.:-]{1,60}$/;
const MODEL_RE = /^[A-Za-z0-9._:+/ -]{1,120}$/;
const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,5}(?:-[0-9A-Za-z.-]{1,20})?$/;
// Allowed slack between the claimed duration and ended−started (rounding).
const DURATION_TOLERANCE_SECONDS = 2;

const MAX_MODELS = 20;
const MAX_TOOLS = 60;
const MAX_FRAMEWORKS = 20;
// Loose ceilings; the eval score uses DEFAULT_CAPS, these just bound storage.
const MAX_RUN_COUNT = 100_000;
const MAX_WORKFLOWS = 10_000;
const MAX_DURATION_SECONDS = 60 * 60 * 24 * 90; // 90 days — generous sanity bound

function validEvals(raw: unknown): EvalSignals | null {
  if (!isObj(raw)) return null;
  const fw = raw.eval_frameworks_detected;
  if (!Array.isArray(fw) || fw.length > MAX_FRAMEWORKS) return null;
  if (!fw.every((f) => typeof f === 'string' && f.length > 0 && f.length <= 40)) return null;
  if (!isInt(raw.eval_files_created) || raw.eval_files_created < 0) return null;
  if (!isInt(raw.eval_run_count) || raw.eval_run_count < 0 || raw.eval_run_count > MAX_RUN_COUNT) return null;
  if (!isInt(raw.eval_iteration_cycles) || raw.eval_iteration_cycles < 0) return null;
  if (!isInt(raw.workflows_with_evals) || raw.workflows_with_evals < 0 || raw.workflows_with_evals > MAX_WORKFLOWS)
    return null;
  const delta = raw.pass_rate_delta;
  if (delta !== null && (!isFiniteNum(delta) || delta < -1 || delta > 1)) return null;
  return {
    eval_files_created: raw.eval_files_created,
    eval_frameworks_detected: [...(fw as string[])],
    eval_run_count: raw.eval_run_count,
    eval_iteration_cycles: raw.eval_iteration_cycles,
    pass_rate_delta: delta as number | null,
    workflows_with_evals: raw.workflows_with_evals,
  };
}

/**
 * Validate a decoded flight-record payload. Enforces the metadata-only shape,
 * sane bounds, and the ≤16 KB canonical-size cap. On success returns the
 * typed payload AND its canonical string (so the caller hashes/verifies the
 * exact same bytes the validator checked).
 */
export function validatePayload(raw: unknown): ValidationResult {
  if (!isObj(raw)) return { ok: false, reason: 'Payload must be a JSON object.' };
  if (raw.v !== PAYLOAD_VERSION) return { ok: false, reason: `Unsupported record version (need v${PAYLOAD_VERSION}).` };

  if (typeof raw.cc_session_hash !== 'string' || !SESSION_HASH_RE.test(raw.cc_session_hash))
    return { ok: false, reason: 'cc_session_hash must be a SHA-256 hex digest.' };

  for (const k of ['started_at', 'ended_at', 'generated_at'] as const) {
    if (typeof raw[k] !== 'string' || !ISO_RE.test(raw[k] as string) || Number.isNaN(Date.parse(raw[k] as string)))
      return { ok: false, reason: `${k} must be an ISO-8601 timestamp.` };
  }
  const span = (Date.parse(raw.ended_at as string) - Date.parse(raw.started_at as string)) / 1000;
  if (span < 0) return { ok: false, reason: 'ended_at precedes started_at.' };

  if (!isFiniteNum(raw.duration_seconds) || raw.duration_seconds < 0 || raw.duration_seconds > MAX_DURATION_SECONDS)
    return { ok: false, reason: 'duration_seconds out of range.' };
  // Duration must agree with the timestamps — no padding a "flight time".
  if (Math.abs(raw.duration_seconds - span) > DURATION_TOLERANCE_SECONDS)
    return { ok: false, reason: 'duration_seconds disagrees with the timestamps.' };

  if (!Array.isArray(raw.models) || raw.models.length < 1 || raw.models.length > MAX_MODELS)
    return { ok: false, reason: 'models must be a non-empty array (≤20).' };
  if (!raw.models.every((m) => typeof m === 'string' && MODEL_RE.test(m)))
    return { ok: false, reason: 'each model must be a short plain string.' };

  if (!isObj(raw.tool_call_counts)) return { ok: false, reason: 'tool_call_counts must be an object.' };
  const toolKeys = Object.keys(raw.tool_call_counts);
  if (toolKeys.length > MAX_TOOLS) return { ok: false, reason: 'too many tool_call_counts entries.' };
  for (const key of toolKeys) {
    if (!TOOL_NAME_RE.test(key)) return { ok: false, reason: `invalid tool name: ${key.slice(0, 20)}` };
    const n = (raw.tool_call_counts as Record<string, unknown>)[key];
    if (!isInt(n) || n < 0 || n > 1_000_000) return { ok: false, reason: `invalid count for ${key}.` };
  }

  const evals = validEvals(raw.evals);
  if (!evals) return { ok: false, reason: 'evals object is malformed.' };

  if (typeof raw.cli_version !== 'string' || !VERSION_RE.test(raw.cli_version))
    return { ok: false, reason: 'cli_version must be semver.' };

  const payload: FlightPayload = {
    v: PAYLOAD_VERSION,
    cc_session_hash: raw.cc_session_hash,
    started_at: raw.started_at as string,
    ended_at: raw.ended_at as string,
    duration_seconds: raw.duration_seconds,
    models: [...(raw.models as string[])],
    tool_call_counts: { ...(raw.tool_call_counts as Record<string, number>) },
    evals,
    generated_at: raw.generated_at as string,
    cli_version: raw.cli_version as string,
  };

  const canonical = canonicalize(payload);
  if (utf8(canonical).length > PAYLOAD_MAX_BYTES)
    return { ok: false, reason: `Record too large (>${PAYLOAD_MAX_BYTES} bytes).` };

  return { ok: true, payload, canonical };
}

// --- Eval scoring (server-authoritative) -----------------------------------
// The client's signals are clamped to the shared anti-gaming caps, then scored
// with the shared eval-detector weights. Any score the client *claims* is
// ignored — the badge says "a registered device signed this metadata", and the
// number beside it is always ours.
export function clampEvals(e: EvalSignals): EvalSignals {
  return {
    eval_files_created: Math.min(Math.max(0, Math.floor(e.eval_files_created)), DEFAULT_CAPS.eval_files_created),
    eval_iteration_cycles: Math.min(
      Math.max(0, Math.floor(e.eval_iteration_cycles)),
      DEFAULT_CAPS.eval_iteration_cycles,
    ),
    eval_run_count: Math.max(0, Math.floor(e.eval_run_count)),
    workflows_with_evals: Math.max(0, Math.floor(e.workflows_with_evals)),
    eval_frameworks_detected: e.eval_frameworks_detected.slice(0, MAX_FRAMEWORKS),
    pass_rate_delta: e.pass_rate_delta === null ? null : Math.max(-1, Math.min(1, e.pass_rate_delta)),
  };
}

export function evalScore(e: EvalSignals): number {
  const clamped = clampEvals(e);
  return isScoreEligible(clamped) ? scoreEvals(clamped) : 0;
}
