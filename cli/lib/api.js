// Thin API client. Base URL defaults to production; AGENTRIDERS_API (or the
// --api flag, which sets it) points the CLI at a local dev server. All calls
// are JSON over HTTPS — no cookies, so the server's Origin check passes and
// authorization is the link code or the record signature.

import crypto from 'node:crypto';

export function apiBase() {
  return (process.env.AGENTRIDERS_API || 'https://agentriders.com').replace(/\/+$/, '');
}

const toB64url = (b64) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256hex = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

/**
 * A device-signed request (the AR-Device-v1 scheme). Authorization is an
 * ed25519 signature over a canonical string — no cookie — so an agent (CLI or
 * MCP) can make rider-scoped calls the same way. The server's device-auth
 * fallback rebuilds the identical string and verifies it.
 *
 * keypair is loadOrCreateKey()'s return: { fingerprint, sign(message)->base64 }.
 * Returns { ok, status, data }.
 */
export async function signedFetch({ baseUrl, method, path, body, keypair }) {
  const base = (baseUrl || apiBase()).replace(/\/+$/, '');
  const m = String(method).toUpperCase();
  const bodyStr = body === undefined || body === null ? '' : JSON.stringify(body);
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = toB64url(crypto.randomBytes(18).toString('base64')); // 144 bits
  // Exact bytes, \n-joined, UTF-8 (must match src/lib/device-auth.ts).
  const canonical = ['AR-Device-v1', m, path, ts, nonce, sha256hex(bodyStr)].join('\n');
  const signature = toB64url(keypair.sign(canonical));

  const headers = {
    'X-AR-Device': keypair.fingerprint,
    'X-AR-Timestamp': ts,
    'X-AR-Nonce': nonce,
    Authorization: `AR-Device ${signature}`,
  };
  // Always declare JSON on writes — a bodyless POST with no Content-Type looks
  // form-like to the server's Origin/CSRF check and gets a 403; application/json
  // is exempt (these calls carry no cookie, so CSRF doesn't apply).
  if (m !== 'GET' && m !== 'HEAD') headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(base + path, { method: m, headers, body: bodyStr || undefined });
  } catch (err) {
    return { ok: false, status: 0, data: { error: `Network error: ${err.message}` } };
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { ok: res.ok, status: res.status, data: data ?? {} };
}

async function postJson(path, body) {
  let res;
  try {
    res = await fetch(apiBase() + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, status: 0, data: { error: `Network error: ${err.message}` } };
  }
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON body — leave data empty */
  }
  return { ok: res.ok, status: res.status, data: data ?? {} };
}

export function linkDevice({ code, publicKey, name }) {
  return postJson('/api/devices/link', { code, public_key: publicKey, name });
}

export function postRecord({ payload, signature, publicKey, log }) {
  return postJson('/api/flight-records', {
    payload,
    signature,
    public_key: publicKey,
    log: log || undefined,
  });
}
