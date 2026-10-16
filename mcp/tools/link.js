// agentriders_link_device — register this machine's key to a rider, using a
// one-time code from <baseUrl>/me/devices.

import { loadOrCreateKey } from '../../cli/lib/keys.js';
import { linkDevice } from '../../cli/lib/api.js';

export async function linkDeviceTool(input = {}) {
  const code = typeof input.code === 'string' ? input.code.trim() : '';
  if (!code) return { linked: false, error: 'A link code is required — get one at <baseUrl>/me/devices.' };

  const key = loadOrCreateKey();
  const name = typeof input.name === 'string' && input.name ? input.name : undefined;
  const res = await linkDevice({ code, publicKey: key.publicKeyB64, name });

  if (res.status === 200 && res.data && res.data.ok) {
    return { linked: true, handle: res.data.handle, deviceId: key.fingerprint };
  }
  return { linked: false, error: (res.data && res.data.error) || `Link failed (HTTP ${res.status}).` };
}
