// Web-standard crypto helpers shared by sessions, magic links and device
// codes. Erasable TypeScript only — unit tests import this file directly
// under `node --test` (Node 22 type stripping).

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Cryptographically random token in the base64url alphabet. One character
 * per random byte (6 bits each), so the default 32 bytes give 192 bits of
 * entropy in a 32-character cookie-safe string.
 */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let out = '';
  for (const b of buf) out += BASE64URL[b & 63];
  return out;
}

/** Lowercase hex SHA-256 of a UTF-8 string. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
