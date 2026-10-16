// MCP draft/file guardrails + the schema round-trip that guarantees an
// MCP-filed log can never fail the build.

import test from 'node:test';
import assert from 'node:assert/strict';

import { draftFlightLog } from '../mcp/tools/draft.js';
import { fileFlightLog } from '../mcp/tools/file.js';
import { parseMarkdown } from '../mcp/lib/frontmatter.js';
import { slugify as mcpSlugify } from '../mcp/lib/slug.js';
import { slugify as realSlugify } from '../src/lib/log-schema.ts';
import { composerSchema } from '../src/lib/submissions.ts';
import { logFrontmatterSchema } from '../src/lib/log-schema.ts';

const SESSION = [
  JSON.stringify({ sessionId: 'mcp-sess-1', timestamp: '2026-10-16T09:00:00.000Z', message: { role: 'user', content: [{ type: 'text', text: 'my aws key is AKIASECRET and the repo is /home/me/acme-private' }] } }),
  JSON.stringify({ sessionId: 'mcp-sess-1', timestamp: '2026-10-16T09:05:00.000Z', message: { role: 'assistant', model: 'claude-opus-4-8', content: [{ type: 'tool_use', id: 't1', name: 'Write', input: { file_path: '/home/me/acme-private/test_x.py', content: 'import pytest' } }] } }),
  JSON.stringify({ sessionId: 'mcp-sess-1', timestamp: '2026-10-16T09:40:00.000Z', message: { role: 'assistant', model: 'claude-opus-4-8', content: [{ type: 'tool_use', id: 't2', name: 'Bash', input: { command: 'pytest' } }] } }),
].join('\n');

const base = () => ({
  title: 'Shipped the parser',
  task: 'code' as const,
  outcome: 'landed' as const,
  cost_usd: 4.2,
  lesson: 'Branch it and keep the numbers in.',
  reins: { scope: 'the parser module', budget: '$10', kill_switch: 'ctrl-c', autonomy: 'supervised' },
  burns: [{ what: 'a flaky test', recovery: 'pinned the seed', cost_usd: 0.1 }],
  body: 'Did the work.',
});

// Write the sample session to a temp file so discovery finds it by explicit path.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-'));
const sessionFile = path.join(tmp, 'mcp-sess-1.jsonl');
fs.writeFileSync(sessionFile, SESSION);

test('slugify mirrors the real schema slugify', () => {
  for (const s of ['Shipped the Parser!', 'a  b__c', 'Ünïcödé Flight', '--edge--', 'ALLCAPS']) {
    assert.equal(mcpSlugify(s), realSlugify(s), `slug drift on: ${s}`);
  }
});

test('verified draft grounds telemetry and leaks nothing', () => {
  const r = draftFlightLog({ ...base(), session_log_path: sessionFile });
  assert.equal(r.verifiable, true);
  assert.ok(r.egress_payload);
  assert.equal(r.provenance.duration, 'verified');
  assert.equal(r.validation, 'ok');
  const blob = JSON.stringify(r.egress_payload);
  for (const secret of ['AKIASECRET', 'acme-private', '/home/me', 'test_x.py', 'import pytest', 'aws key']) {
    assert.equal(blob.includes(secret), false, `leaked: ${secret}`);
  }
});

test('no session → unverified, verifiable false, no payload', () => {
  const r = draftFlightLog({ ...base(), session_log_path: '/does/not/exist.jsonl', duration: '30m' });
  assert.equal(r.verifiable, false);
  assert.equal(r.egress_payload, null);
  assert.equal(r.provenance.duration, 'unverified');
  assert.equal(r.validation, 'ok'); // duration supplied by the agent
});

test('cost_usd of 0 (unchecked) is rejected', () => {
  const r = draftFlightLog({ ...base(), cost_usd: 0, session_log_path: sessionFile });
  assert.notEqual(r.validation, 'ok');
  assert.ok((r.validation as { issues: string[] }).issues.some((i) => i.includes('cost_usd')));
});

test('schema round-trip: draft markdown parses under composerSchema AND the content schema', () => {
  const r = draftFlightLog({ ...base(), session_log_path: sessionFile });
  const { frontmatter } = parseMarkdown(r.markdown);
  // API-side validation (what POST /api/submissions runs).
  const composer = composerSchema.parse(frontmatter);
  // Build-time validation (what the content collection runs on the committed file).
  const full = logFrontmatterSchema.parse({ ...composer, rider: 'pilot', draft: false });
  assert.equal(full.title, 'Shipped the parser');
  assert.equal(full.task, 'code');
  assert.ok(full.duration);
});

test('file refuses without confirm: true (no network)', async () => {
  const r = await fileFlightLog({ slug: 'x', markdown: '---\ntitle: x\n---\n', confirm: false });
  assert.ok(r.error && r.error.includes('confirm'));
});
