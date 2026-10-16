// Devices and link codes: the account half of CLI pairing.
//
// A rider mints a short code on /me/devices; the CLI exchanges it (plus its
// Ed25519 public key) for a registered device. We never store the plaintext
// code — only SHA-256(code + pepper), single-use with a 10-minute expiry, so a
// leaked database cannot be replayed into a pairing. The device id is the key
// fingerprint, which is how signed records later resolve to a rider.

import { sha256Hex, deviceFingerprint } from './verify';

// Unambiguous alphabet (no I/O/0/1) so a code is easy to read aloud and type.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;
export const CODE_TTL_SECONDS = 10 * 60;
const MAX_DEVICE_NAME = 60;
const MAX_DEVICES_PER_RIDER = 20;

export type DeviceRow = {
  id: string;
  rider_id: string;
  public_key: string;
  name: string | null;
  created_at: string;
  revoked_at: string | null;
};

/** A fresh link code in the display alphabet (uppercase, groupable). */
export function generateLinkCode(): string {
  const buf = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(buf);
  let out = '';
  for (const b of buf) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return out;
}

/**
 * Normalize user-entered codes: uppercase, drop spaces/dashes. Returns the
 * canonical code or null when it isn't the right length/alphabet.
 */
export function normalizeCode(input: string): string | null {
  const cleaned = String(input).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length !== CODE_LENGTH) return null;
  for (const ch of cleaned) if (!CODE_ALPHABET.includes(ch)) return null;
  return cleaned;
}

async function hashCode(code: string, pepper: string): Promise<string> {
  return sha256Hex(`device-code:${code}:${pepper}`);
}

/** Mint a link code for a rider, store its hash, return the plaintext once. */
export async function createLinkCode(db: D1Database, pepper: string, riderId: string): Promise<string> {
  const code = generateLinkCode();
  const now = new Date();
  const expires = new Date(now.getTime() + CODE_TTL_SECONDS * 1000);
  await db
    .prepare(
      'INSERT INTO device_link_codes (code_hash, rider_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    )
    .bind(await hashCode(code, pepper), riderId, now.toISOString(), expires.toISOString())
    .run();
  return code;
}

/**
 * Atomically consume a link code. Returns the rider id on success, or null if
 * the code is unknown, already used, or expired. The single-use guarantee is
 * the conditional UPDATE (consumed_at IS NULL); expiry is checked in the same
 * statement so a stale code can never pair.
 */
export async function consumeLinkCode(
  db: D1Database,
  pepper: string,
  rawCode: string,
): Promise<string | null> {
  const code = normalizeCode(rawCode);
  if (!code) return null;
  const hash = await hashCode(code, pepper);
  const now = new Date().toISOString();
  const res = await db
    .prepare(
      `UPDATE device_link_codes SET consumed_at = ?
       WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > ?`,
    )
    .bind(now, hash, now)
    .run();
  if (res.meta.changes !== 1) return null;
  const row = await db
    .prepare('SELECT rider_id FROM device_link_codes WHERE code_hash = ?')
    .bind(hash)
    .first<{ rider_id: string }>();
  return row?.rider_id ?? null;
}

export type RegisterResult =
  | { ok: true; deviceId: string; reused: boolean }
  | { ok: false; status: number; reason: string };

/**
 * Register (or re-activate) a device for a rider from its public key. The id
 * is the key fingerprint, so re-registering the same key is idempotent for the
 * owner (name refreshed, revocation cleared). A key already bound to a
 * *different* rider is rejected — one public key, one device, one rider.
 */
export async function registerDevice(
  db: D1Database,
  riderId: string,
  publicKeyB64: string,
  name: string | null,
): Promise<RegisterResult> {
  let deviceId: string;
  try {
    deviceId = await deviceFingerprint(publicKeyB64);
  } catch {
    return { ok: false, status: 400, reason: 'Invalid public key.' };
  }
  // Strip control chars and angle brackets so the name is a safe plain label
  // wherever it renders (defense-in-depth beyond Astro's auto-escaping).
  const cleanName = name
    ? name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, MAX_DEVICE_NAME) || null
    : null;

  const existing = await db
    .prepare('SELECT id, rider_id FROM devices WHERE id = ?')
    .bind(deviceId)
    .first<{ id: string; rider_id: string }>();
  if (existing) {
    if (existing.rider_id !== riderId)
      return { ok: false, status: 409, reason: 'This device key is already registered.' };
    await db
      .prepare('UPDATE devices SET name = COALESCE(?, name), revoked_at = NULL WHERE id = ?')
      .bind(cleanName, deviceId)
      .run();
    return { ok: true, deviceId, reused: true };
  }

  const count = await db
    .prepare('SELECT COUNT(*) AS n FROM devices WHERE rider_id = ? AND revoked_at IS NULL')
    .bind(riderId)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_DEVICES_PER_RIDER)
    return { ok: false, status: 429, reason: 'Device limit reached. Revoke an old one first.' };

  try {
    await db
      .prepare('INSERT INTO devices (id, rider_id, public_key, name, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(deviceId, riderId, publicKeyB64, cleanName, new Date().toISOString())
      .run();
  } catch (error) {
    // Lost a race (the same key being registered concurrently) — the PRIMARY
    // KEY makes one-key-one-device hold; report it cleanly instead of a 500.
    if (`${(error as Error).message}`.includes('UNIQUE'))
      return { ok: false, status: 409, reason: 'This device key is already registered.' };
    throw error;
  }
  return { ok: true, deviceId, reused: false };
}

/** Active device for a fingerprint, or null if unknown or revoked. */
export async function activeDeviceByFingerprint(
  db: D1Database,
  fingerprint: string,
): Promise<DeviceRow | null> {
  const row = await db
    .prepare('SELECT id, rider_id, public_key, name, created_at, revoked_at FROM devices WHERE id = ?')
    .bind(fingerprint)
    .first<DeviceRow>();
  if (!row || row.revoked_at) return null;
  return row;
}

export async function listDevices(db: D1Database, riderId: string): Promise<DeviceRow[]> {
  return (
    (
      await db
        .prepare(
          `SELECT id, rider_id, public_key, name, created_at, revoked_at
           FROM devices WHERE rider_id = ? ORDER BY created_at DESC`,
        )
        .bind(riderId)
        .all<DeviceRow>()
    ).results ?? []
  );
}

/** Revoke a device the rider owns. Returns true when a row was revoked. */
export async function revokeDevice(db: D1Database, riderId: string, deviceId: string): Promise<boolean> {
  const res = await db
    .prepare('UPDATE devices SET revoked_at = ? WHERE id = ? AND rider_id = ? AND revoked_at IS NULL')
    .bind(new Date().toISOString(), deviceId, riderId)
    .run();
  return res.meta.changes === 1;
}
