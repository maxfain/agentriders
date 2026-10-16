// agentriders_status — read-only. Reports the device key, who it is linked to
// (if online), the base URL, and whether a session log is discoverable. Does
// NOT create a key (so status stays a pure read).

import fs from 'node:fs';
import { loadOrCreateKey, keyPath } from '../../cli/lib/keys.js';
import { apiBase, signedFetch } from '../../cli/lib/api.js';
import { discoverSession } from '../lib/discover.js';

export async function status() {
  const kp = keyPath();
  const keyPresent = fs.existsSync(kp);
  const sessionPath = discoverSession();

  const result = {
    keyPresent,
    baseUrl: apiBase(),
    sessionDiscoverable: Boolean(sessionPath),
    sessionPath: sessionPath || undefined,
  };

  if (keyPresent) {
    const key = loadOrCreateKey();
    result.deviceId = key.fingerprint;
    try {
      const me = await signedFetch({ method: 'GET', path: '/api/me', keypair: key });
      if (me.status === 200 && me.data && me.data.authenticated) result.linkedHandle = me.data.handle;
    } catch {
      /* offline — leave linkedHandle undefined */
    }
  }
  return result;
}
