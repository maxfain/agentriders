import type { APIRoute } from 'astro';
import { rateLimit } from '../../../lib/ratelimit';
import { activeDeviceByFingerprint } from '../../../lib/devices';
import { matchRecordToLog } from '../../../lib/flight-records';
import { deviceFingerprint, verifySignature, validatePayload, recordHash, evalScore } from '../../../lib/verify';

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Upload a signed, metadata-only flight record. Authorization is the Ed25519
// signature over the canonical payload: the key fingerprint resolves to a
// registered device, and the device belongs to a rider. No session cookie —
// this is the CLI. Deduped by exact record and by Claude Code session.
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (!(await rateLimit(env.RATE, `records:${ip}`, 60, 3600))) {
    return json(429, { error: 'Too many uploads. Try again later.' });
  }

  let body: { payload?: unknown; signature?: unknown; public_key?: unknown; log?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json(400, { error: 'Send JSON: { payload, signature, public_key, log? }.' });
  }
  const signature = typeof body.signature === 'string' ? body.signature : '';
  const publicKey = typeof body.public_key === 'string' ? body.public_key : '';
  if (!signature || !publicKey) return json(400, { error: 'signature and public_key are required.' });

  // Shape + bounds first, so we hash/verify the exact bytes we validated.
  const validation = validatePayload(body.payload);
  if (!validation.ok) return json(400, { error: validation.reason });
  const { payload, canonical } = validation;

  // Resolve the device by key fingerprint; verify against the REGISTERED key.
  let fingerprint: string;
  try {
    fingerprint = await deviceFingerprint(publicKey);
  } catch {
    return json(400, { error: 'public_key must be a base64 32-byte Ed25519 key.' });
  }
  const device = await activeDeviceByFingerprint(env.DB, fingerprint);
  if (!device) return json(401, { error: 'Unknown or revoked device. Run `agentriders login`.' });

  const verified = await verifySignature(device.public_key, signature, canonical);
  if (!verified) return json(401, { error: 'Signature does not verify.' });

  const riderId = device.rider_id;
  const hash = await recordHash(canonical);

  // Clean dedupe messages (the UNIQUE indexes are the race backstop below).
  const dupHash = await env.DB.prepare('SELECT id FROM flight_records WHERE record_hash = ?')
    .bind(hash)
    .first<{ id: string }>();
  if (dupHash) return json(409, { error: 'This exact record was already uploaded.', record_id: dupHash.id });

  const dupSession = await env.DB.prepare(
    'SELECT id, matched_log_slug FROM flight_records WHERE rider_id = ? AND cc_session_hash = ?',
  )
    .bind(riderId, payload.cc_session_hash)
    .first<{ id: string; matched_log_slug: string | null }>();
  if (dupSession)
    return json(409, {
      error: 'This Claude Code session already has a flight record.',
      record_id: dupSession.id,
      matched_log_slug: dupSession.matched_log_slug,
    });

  const recordId = crypto.randomUUID();
  const score = evalScore(payload.evals);
  try {
    await env.DB.prepare(
      `INSERT INTO flight_records
         (id, rider_id, device_id, payload_json, signature, record_hash, cc_session_hash, evals_score, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(recordId, riderId, device.id, canonical, signature, hash, payload.cc_session_hash, score, new Date().toISOString())
      .run();
  } catch (error) {
    // Lost a race on one of the UNIQUE indexes — report it as a duplicate.
    if (`${(error as Error).message}`.includes('UNIQUE')) {
      return json(409, { error: 'This record (or session) was just uploaded.' });
    }
    throw error;
  }

  // Optional one-shot match to a published log of this rider's.
  let matched: string | null = null;
  let matchError: string | null = null;
  const slug = typeof body.log === 'string' ? body.log.trim() : '';
  if (slug) {
    const m = await matchRecordToLog(env.DB, riderId, recordId, slug);
    if (m.ok) matched = slug;
    else matchError = m.reason;
  }

  return json(201, {
    ok: true,
    record_id: recordId,
    evals_score: score,
    matched_log_slug: matched,
    match_error: matchError,
  });
};
