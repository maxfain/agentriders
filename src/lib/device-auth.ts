// Device-signature auth (the AR-Device-v1 scheme). Lets an agent — the CLI or
// the MCP server — make rider-scoped calls with an ed25519 signature instead
// of a browser session cookie. The client half is signedFetch in
// cli/lib/api.js; this rebuilds the identical canonical string and verifies it.
//
// Returns the RiderRow on success, or null on ANY failure — the caller treats
// null as "signed out", and this never throws into the request path. Device
// auth deliberately does NOT grant /admin (enforced in the middleware by also
// requiring a cookie session).

import { verifySignature, sha256Hex } from './verify.ts';
import type { RiderRow } from './session';

const MAX_SKEW_SECONDS = 300;
const NONCE_RE = /^[A-Za-z0-9_-]{16,128}$/;
const DEVICE_ID_RE = /^[0-9a-f]{64}$/;
const SCHEME = 'AR-Device ';

// base64url (from the Authorization header) → standard base64 for verifySignature.
function b64urlToB64(s: string): string {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  return t + '='.repeat((4 - (t.length % 4)) % 4);
}

export async function resolveDeviceAuth(
  env: AgentRidersEnv,
  request: Request,
  url: URL,
): Promise<RiderRow | null> {
  const deviceId = request.headers.get('X-AR-Device');
  const ts = request.headers.get('X-AR-Timestamp');
  const nonce = request.headers.get('X-AR-Nonce');
  const authz = request.headers.get('Authorization');

  // Fast exit when this isn't a device-signed request (the common case).
  if (!deviceId || !ts || !nonce || !authz || !authz.startsWith(SCHEME)) return null;
  if (!DEVICE_ID_RE.test(deviceId) || !NONCE_RE.test(nonce)) return null;

  const tsNum = Number(ts);
  if (!Number.isInteger(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > MAX_SKEW_SECONDS) return null;

  try {
    // Device must exist and be active; rider must exist and not be banned.
    const device = await env.DB.prepare(
      'SELECT rider_id, public_key, revoked_at FROM devices WHERE id = ?',
    )
      .bind(deviceId)
      .first<{ rider_id: string; public_key: string; revoked_at: string | null }>();
    if (!device || device.revoked_at) return null;

    const rider = await env.DB.prepare(
      `SELECT id, handle, display_name, bio, rank, is_admin, banned_at, created_at
       FROM riders WHERE id = ?`,
    )
      .bind(device.rider_id)
      .first<RiderRow>();
    if (!rider || rider.banned_at) return null;

    // Rebuild the canonical string over the body we actually received, and
    // verify against the REGISTERED key. request.clone() leaves the original
    // body intact for the downstream route handler.
    const bodyText = await request.clone().text();
    const canonical = [
      'AR-Device-v1',
      request.method.toUpperCase(),
      url.pathname + url.search,
      ts,
      nonce,
      await sha256Hex(bodyText),
    ].join('\n');
    const signatureB64 = b64urlToB64(authz.slice(SCHEME.length));
    if (!(await verifySignature(device.public_key, signatureB64, canonical))) return null;

    // Single-use nonce (replay defense). Checked AFTER signature verification
    // so unauthenticated spam can't fill the KV. TTL exceeds the skew window,
    // so a replay inside the valid window is always caught.
    const nonceKey = `arnonce:${deviceId}:${nonce}`;
    if (await env.RATE.get(nonceKey)) return null;
    await env.RATE.put(nonceKey, '1', { expirationTtl: 600 });

    return rider;
  } catch {
    return null;
  }
}
