// Canonical JSON — the exact serialization the signature is computed over.
//
// This MUST stay byte-for-byte identical to canonicalize() in
// src/lib/verify.ts, or every signature this CLI makes will fail server-side.
// The two are pinned together by shared vectors in tests/verify.test.ts.
// Rules: object keys sorted, `undefined` dropped, no insignificant whitespace,
// numbers via JSON.stringify (non-finite rejected).

export function canonicalize(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number');
    return JSON.stringify(value);
  }
  if (t === 'boolean' || t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalize(v ?? null)).join(',')}]`;
  if (t === 'object') {
    const parts = [];
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) continue;
      parts.push(`${JSON.stringify(key)}:${canonicalize(value[key])}`);
    }
    return `{${parts.join(',')}}`;
  }
  throw new Error(`cannot canonicalize ${t}`);
}
