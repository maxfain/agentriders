// The request-body cap in front of the JSON API (src/lib/http.ts): the
// middleware's Content-Length verdict and the handlers' capped read share one
// limit, pass everything a rider legitimately sends, and stop an oversized
// body — declared or chunked — before it is buffered.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_API_BODY_BYTES,
  declaredBodyTooLarge,
  readJsonCapped,
  BodyTooLargeError,
} from '../src/lib/http.ts';

const headers = (contentLength?: string) =>
  new Headers(contentLength === undefined ? {} : { 'Content-Length': contentLength });

const jsonRequest = (body: string) =>
  new Request('https://x.test/api/submissions', { method: 'POST', body });

// A streamed body with no Content-Length, the shape a chunked upload reaches
// the worker in. Counts the chunks actually pulled so a test can show the
// read stopped early.
function chunkedRequest(chunks: Uint8Array[]) {
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled < chunks.length) controller.enqueue(chunks[pulled++]);
      else controller.close();
    },
  });
  const request = new Request('https://x.test/api/me/profile', {
    method: 'PUT',
    body: stream,
    duplex: 'half',
  } as RequestInit);
  return { request, pulled: () => pulled };
}

const encode = (s: string) => new TextEncoder().encode(s);

// `{"body_md":"` + n × 'x' + `"}` is n + 14 bytes of ASCII.
const jsonOfLength = (bytes: number) => JSON.stringify({ body_md: 'x'.repeat(bytes - 14) });

test('cap: 256 KiB, inclusive, on the declared Content-Length', () => {
  assert.equal(MAX_API_BODY_BYTES, 262144);
  assert.equal(declaredBodyTooLarge(headers('0')), false);
  assert.equal(declaredBodyTooLarge(headers('262144')), false);
  assert.equal(declaredBodyTooLarge(headers('262145')), true);
  assert.equal(declaredBodyTooLarge(headers('307200')), true); // the 300 KiB probe
  assert.equal(declaredBodyTooLarge(headers('999999999999999999999')), true);
  assert.equal(declaredBodyTooLarge(headers('11'), 10), true);
});

test('cap: no verdict without a readable Content-Length', () => {
  assert.equal(declaredBodyTooLarge(headers()), false);
  for (const bad of ['', '  ', 'abc', '-1', '1e9', '0x100000', '1,000,000', '300000 bytes']) {
    assert.equal(declaredBodyTooLarge(headers(bad)), false, JSON.stringify(bad));
  }
});

test('readJsonCapped: parses a normal body like request.json()', async () => {
  assert.deepEqual(await readJsonCapped(jsonRequest(JSON.stringify({ title: 'Shipped' }))), {
    title: 'Shipped',
  });
  assert.equal(await readJsonCapped(jsonRequest('null')), null);
});

test('readJsonCapped: a body at the cap passes, one byte over is refused', async () => {
  const atCap = jsonOfLength(MAX_API_BODY_BYTES);
  assert.equal(Buffer.byteLength(atCap), MAX_API_BODY_BYTES);
  const parsed = (await readJsonCapped(jsonRequest(atCap))) as { body_md: string };
  assert.equal(parsed.body_md.length, MAX_API_BODY_BYTES - 14);

  // Trailing whitespace is still valid JSON, so only the size changes.
  await assert.rejects(readJsonCapped(jsonRequest(`${atCap} `)), BodyTooLargeError);
});

test('readJsonCapped: a chunked body with no Content-Length is stopped mid-stream', async () => {
  const hundredKiB = encode('x'.repeat(100 * 1024));
  const { request, pulled } = chunkedRequest([hundredKiB, hundredKiB, hundredKiB, hundredKiB]);
  assert.equal(request.headers.get('Content-Length'), null);
  assert.equal(declaredBodyTooLarge(request.headers), false); // the middleware lets it through

  await assert.rejects(readJsonCapped(request), BodyTooLargeError);
  // 100 + 100 is under the cap, the third chunk crosses it; the fourth is never read.
  assert.equal(pulled(), 3);
});

test('readJsonCapped: a chunked body under the cap is reassembled, multi-byte splits included', async () => {
  const bytes = encode('{"lesson":"Scope it — then ride."}');
  const cut = bytes.indexOf(0xe2); // first byte of the em dash
  const { request } = chunkedRequest([bytes.slice(0, cut + 1), bytes.slice(cut + 1)]);
  assert.deepEqual(await readJsonCapped(request), { lesson: 'Scope it — then ride.' });
});

test('readJsonCapped: malformed or absent JSON is a SyntaxError, not a size error', async () => {
  await assert.rejects(readJsonCapped(jsonRequest('{"title": ')), SyntaxError);
  await assert.rejects(
    readJsonCapped(new Request('https://x.test/api/submissions', { method: 'POST' })),
    SyntaxError,
  );
  await assert.rejects(readJsonCapped(jsonRequest('')), SyntaxError);
});

test('readJsonCapped: honours a custom budget', async () => {
  await assert.rejects(readJsonCapped(jsonRequest('{"a":"bcdef"}'), 8), BodyTooLargeError);
  assert.deepEqual(await readJsonCapped(jsonRequest('{"a":1}'), 8), { a: 1 });
});
