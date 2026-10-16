// The CLI record builder: proves the payload is metadata-only and that what
// the CLI produces is exactly what the server will accept.

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRecord } from '../cli/lib/record.js';
import { validatePayload, canonicalize } from '../src/lib/verify.ts';

const SESSION = [
  JSON.stringify({
    sessionId: 'abc-123-session',
    timestamp: '2026-10-16T10:00:00.000Z',
    message: { role: 'user', content: [{ type: 'text', text: 'my password is hunter2 and the repo is /home/me/topsecret' }] },
  }),
  JSON.stringify({
    sessionId: 'abc-123-session',
    timestamp: '2026-10-16T10:01:00.000Z',
    message: {
      role: 'assistant',
      model: 'claude-opus-4-8',
      content: [{ type: 'tool_use', id: 't1', name: 'Write', input: { file_path: '/home/me/topsecret/test_x.py', content: 'import pytest' } }],
    },
  }),
  JSON.stringify({
    sessionId: 'abc-123-session',
    timestamp: '2026-10-16T10:02:00.000Z',
    message: { role: 'assistant', model: 'claude-opus-4-8', content: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'pytest test_x.py' } }] },
  }),
  JSON.stringify({
    sessionId: 'abc-123-session',
    timestamp: '2026-10-16T10:02:05.000Z',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't2', is_error: false, content: '1 passed, 0 failed' }] },
  }),
].join('\n');

test('buildRecord emits only the allowed metadata keys', () => {
  const rec = buildRecord(SESSION, { cliVersion: '0.1.0' });
  assert.deepEqual(
    Object.keys(rec).sort(),
    ['cc_session_hash', 'cli_version', 'duration_seconds', 'ended_at', 'evals', 'generated_at', 'models', 'started_at', 'tool_call_counts', 'v'],
  );
  assert.deepEqual(rec.models, ['claude-opus-4-8']);
  assert.deepEqual(rec.tool_call_counts, { Write: 1, Bash: 1 });
  assert.equal(rec.duration_seconds, 125);
});

test('buildRecord leaks no prompt, path, code, or command text', () => {
  const blob = JSON.stringify(buildRecord(SESSION, { cliVersion: '0.1.0' }));
  for (const secret of ['hunter2', 'topsecret', 'password', '/home/me', 'test_x.py', 'import pytest', 'pytest test_x.py']) {
    assert.equal(blob.includes(secret), false, `leaked: ${secret}`);
  }
});

test('a CLI-built record passes server validation', () => {
  const rec = buildRecord(SESSION, { cliVersion: '0.1.0' });
  const r = validatePayload(rec);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.canonical, canonicalize(rec));
});

test('cc_session_hash is stable per session id, independent of generated_at', () => {
  const a = buildRecord(SESSION, { cliVersion: '0.1.0', now: new Date('2026-10-16T11:00:00Z') });
  const b = buildRecord(SESSION, { cliVersion: '0.1.0', now: new Date('2026-10-17T11:00:00Z') });
  assert.equal(a.cc_session_hash, b.cc_session_hash);
  assert.match(a.cc_session_hash, /^[0-9a-f]{64}$/);
});

test('buildRecord throws on a log with no timestamps', () => {
  assert.throws(() => buildRecord('{"message":{"role":"user","content":[]}}', { cliVersion: '0.1.0' }));
});

test('buildRecord throws when no model was recorded', () => {
  const noModel = [
    JSON.stringify({ sessionId: 's', timestamp: '2026-10-16T10:00:00.000Z', message: { role: 'user', content: [] } }),
    JSON.stringify({ sessionId: 's', timestamp: '2026-10-16T10:01:00.000Z', message: { role: 'user', content: [] } }),
  ].join('\n');
  assert.throws(() => buildRecord(noModel, { cliVersion: '0.1.0' }), /No model recorded/);
});

test('MCP tool names bucket to "mcp" — server/tool identity never leaves, and the payload is server-valid', () => {
  const mcpSession = [
    JSON.stringify({ sessionId: 's2', timestamp: '2026-10-16T10:00:00.000Z', message: { role: 'user', content: [] } }),
    JSON.stringify({
      sessionId: 's2',
      timestamp: '2026-10-16T10:05:00.000Z',
      message: {
        role: 'assistant',
        model: 'claude-opus-4-8',
        content: [
          { type: 'tool_use', id: 'a', name: 'mcp__Acme_Internal_Billing__charge', input: {} },
          { type: 'tool_use', id: 'b', name: 'mcp__clientname_crm__export_contacts', input: {} },
          { type: 'tool_use', id: 'c', name: 'Bash', input: { command: 'ls' } },
        ],
      },
    }),
  ].join('\n');
  const rec = buildRecord(mcpSession, { cliVersion: '0.1.0' });
  assert.deepEqual(rec.tool_call_counts, { mcp: 2, Bash: 1 });
  const blob = JSON.stringify(rec);
  for (const identity of ['Acme', 'Internal_Billing', 'clientname', 'crm', 'charge', 'export_contacts']) {
    assert.equal(blob.includes(identity), false, `leaked MCP identity: ${identity}`);
  }
  // And the bucketed names pass the server's tool-name rules.
  assert.equal(validatePayload(rec).ok, true);
});
