// agentriders_link_device — register this machine's key to a rider, using a
// one-time code from <baseUrl>/me/devices.
//
// The code arrives as a tool argument, so a prompt-injected agent could pass
// an attacker's code and bind this machine to the attacker's account. When the
// client supports elicitation, the human approves the link first.

import { loadOrCreateKey } from '../../cli/lib/keys.js';
import { linkDevice, apiBase } from '../../cli/lib/api.js';

export async function linkDeviceTool(input = {}, { confirmWithHuman } = {}) {
  const code = typeof input.code === 'string' ? input.code.trim() : '';
  if (!code) return { linked: false, error: 'A link code is required — get one at <baseUrl>/me/devices.' };

  if (confirmWithHuman) {
    const verdict = await confirmWithHuman(
      [
        `Link this machine to the ${apiBase()} account that issued code ${code}?`,
        'Only accept if you generated this code yourself at /me/devices — a linked machine can file flight logs as that account.',
      ].join('\n'),
    );
    if (verdict === 'declined') return { linked: false, error: 'The user declined — the device was not linked.' };
  }

  const key = loadOrCreateKey();
  const name = typeof input.name === 'string' && input.name ? input.name : undefined;
  const res = await linkDevice({ code, publicKey: key.publicKeyB64, name });

  if (res.status === 200 && res.data && res.data.ok) {
    return { linked: true, handle: res.data.handle, deviceId: key.fingerprint };
  }
  return { linked: false, error: (res.data && res.data.error) || `Link failed (HTTP ${res.status}).` };
}
