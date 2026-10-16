// Device key store: one Ed25519 keypair per machine, held in
// ~/.agentriders/key.json with 0600 permissions. The private key never leaves
// the machine; only the raw public key (and signatures) are transmitted.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function configDir() {
  // AGENTRIDERS_HOME lets tests (and power users) relocate the key store.
  return process.env.AGENTRIDERS_HOME || path.join(os.homedir(), '.agentriders');
}

export function keyPath() {
  return path.join(configDir(), 'key.json');
}

// Raw 32-byte Ed25519 public key, base64 — the wire + fingerprint format.
function rawPublicKeyB64(publicKey) {
  const jwk = publicKey.export({ format: 'jwk' }); // { kty:'OKP', crv:'Ed25519', x }
  return Buffer.from(jwk.x, 'base64url').toString('base64');
}

/**
 * Load the device key, creating one on first use. Returns:
 *   { publicKeyB64, fingerprint, sign(message) -> base64 signature, created }
 */
export function loadOrCreateKey() {
  const dir = configDir();
  const file = keyPath();
  let stored;
  if (fs.existsSync(file)) {
    stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  } else {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    stored = {
      v: 1,
      created: new Date().toISOString(),
      private_pkcs8: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
      public_raw: rawPublicKeyB64(publicKey),
    };
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, JSON.stringify(stored, null, 2), { mode: 0o600 });
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      /* best effort on platforms without POSIX perms */
    }
  }

  const privateKey = crypto.createPrivateKey({
    key: Buffer.from(stored.private_pkcs8, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });

  const publicKeyB64 = stored.public_raw;
  const fingerprint = crypto
    .createHash('sha256')
    .update(Buffer.from(publicKeyB64, 'base64'))
    .digest('hex');

  return {
    publicKeyB64,
    fingerprint,
    created: stored.created,
    keyFile: file,
    sign(message) {
      return crypto.sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64');
    },
  };
}
