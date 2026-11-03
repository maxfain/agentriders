// Request-body limits for the JSON API. Defence in depth in front of the
// validation layer: zod (and everything after it) only ever sees a body that
// is cheap to hold. The largest legitimate body is a flight-log draft — a few
// KB of markdown plus its frontmatter — and a signed flight record caps
// itself at 16 KB (verify.ts PAYLOAD_MAX_BYTES); 256 KiB is a generous
// ceiling over both. Two layers share this number: the middleware rejects a
// declared Content-Length above it before any handler runs, and the handlers
// read the body through readJsonCapped so a chunked upload with no
// Content-Length is stopped at the same point.
export const MAX_API_BODY_BYTES = 256 * 1024;

// Whether the declared Content-Length is over the cap. Only a plain decimal
// counts; a missing or malformed header is no verdict — the capped read below
// is the layer that never relies on the header — so the middleware never 413s
// a request on a number it could not read.
export function declaredBodyTooLarge(headers: Headers, max = MAX_API_BODY_BYTES): boolean {
  const declared = headers.get('Content-Length')?.trim();
  if (!declared || !/^\d+$/.test(declared)) return false;
  return Number(declared) > max;
}

// Thrown by readJsonCapped when the body outgrows its budget. Its own class
// so a handler can answer 413 for it and keep 400 for malformed JSON.
export class BodyTooLargeError extends Error {
  constructor(max: number) {
    super(`Request body exceeds ${max} bytes.`);
    this.name = 'BodyTooLargeError';
  }
}

// request.json() with a byte budget. Content-Length is advisory — a chunked
// upload carries none and a lying one costs nothing to send — so the stream
// is read chunk by chunk and abandoned the moment it passes `max`, before a
// byte is decoded or parsed. Otherwise it rejects as request.json() would: a
// SyntaxError for malformed (or absent) JSON.
export async function readJsonCapped(request: Request, max = MAX_API_BODY_BYTES): Promise<unknown> {
  if (!request.body) throw new SyntaxError('Unexpected end of JSON input');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new BodyTooLargeError(max);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
