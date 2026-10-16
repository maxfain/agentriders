// Thin API client. Base URL defaults to production; AGENTRIDERS_API (or the
// --api flag, which sets it) points the CLI at a local dev server. All calls
// are JSON over HTTPS — no cookies, so the server's Origin check passes and
// authorization is the link code or the record signature.

export function apiBase() {
  return (process.env.AGENTRIDERS_API || 'https://agentriders.com').replace(/\/+$/, '');
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
