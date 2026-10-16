// MCP draft/file guardrails + the schema round-trip that guarantees an
// MCP-filed log can never fail the build.

import test from 'node:test';
import assert from 'node:assert/strict';

import { draftFlightLog } from '../mcp/tools/draft.js';
import { fileFlightLog } from '../mcp/tools/file.js';
import { validateComposer } from '../mcp/lib/validate.js';
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

// Write the sample session under a temp Claude config dir so discovery accepts
// it by explicit path (explicit paths must live under <config>/projects).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-'));
process.env.CLAUDE_CONFIG_DIR = tmp;
fs.mkdirSync(path.join(tmp, 'projects', '-tmp-proj'), { recursive: true });
const sessionFile = path.join(tmp, 'projects', '-tmp-proj', 'mcp-sess-1.jsonl');
fs.writeFileSync(sessionFile, SESSION);
const outsideFile = path.join(tmp, 'outside.jsonl');
fs.writeFileSync(outsideFile, SESSION);

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

test('validateComposer enforces the real bounds + the cost rule', () => {
  const good = parseMarkdown(draftFlightLog({ ...base(), session_log_path: sessionFile }).markdown).frontmatter;
  assert.deepEqual(validateComposer(good).issues, []);
  assert.ok(validateComposer({ ...good, cost_usd: 0 }).issues.some((i) => i.includes('cost_usd')));
  assert.ok(validateComposer({ ...good, date: '2026-13-45' }).issues.some((i) => i.includes('date')));
  assert.ok(validateComposer({ ...good, title: 'x'.repeat(141) }).issues.some((i) => i.includes('title')));
  assert.ok(validateComposer({ ...good, outcome: 'nope' }).issues.some((i) => i.includes('outcome')));
});

test('file refuses to upload an invalid (cost 0) log even with confirm (no network)', async () => {
  const d = draftFlightLog({ ...base(), cost_usd: 0, session_log_path: sessionFile });
  const r = await fileFlightLog({ slug: d.slug, markdown: d.markdown, confirm: true });
  assert.ok(r.error && Array.isArray(r.issues) && r.issues.some((i: string) => i.includes('cost_usd')));
});

test('explicit session path must be a regular .jsonl under the sessions dir', () => {
  assert.equal(draftFlightLog({ ...base(), session_log_path: outsideFile, duration: '30m' }).verifiable, false);
  assert.equal(draftFlightLog({ ...base(), session_log_path: '/dev/stdin', duration: '30m' }).verifiable, false);
  const traversal = path.join(tmp, 'projects', '..', 'outside.jsonl');
  assert.equal(draftFlightLog({ ...base(), session_log_path: traversal, duration: '30m' }).verifiable, false);
  assert.equal(draftFlightLog({ ...base(), session_log_path: sessionFile }).verifiable, true);
});

test('verified draft returns a draft_id; file rejects an unknown one (no network)', async () => {
  const d = draftFlightLog({ ...base(), session_log_path: sessionFile });
  assert.equal(typeof d.draft_id, 'string');
  const r = await fileFlightLog({ slug: d.slug, markdown: d.markdown, confirm: true, draft_id: 'not-a-draft' });
  assert.ok(r.error && r.error.includes('draft_id'));
});

test('file stops when the human declines, before any key or network use', async () => {
  const d = draftFlightLog({ ...base(), session_log_path: sessionFile });
  let shown = '';
  const r = await fileFlightLog(
    { slug: d.slug, markdown: d.markdown, confirm: true, draft_id: d.draft_id },
    { confirmWithHuman: async (msg: string) => ((shown = msg), 'declined') },
  );
  assert.ok(r.error && r.error.includes('declined'));
  // The human saw the exact log and the signed payload.
  assert.ok(shown.includes('Shipped the parser'));
  assert.ok(shown.includes(d.egress_payload.cc_session_hash));
});

test('link stops when the human declines (no network)', async () => {
  const { linkDeviceTool } = await import('../mcp/tools/link.js');
  const r = await linkDeviceTool({ code: 'ABCD2345' }, { confirmWithHuman: async () => 'declined' });
  assert.equal(r.linked, false);
  assert.ok(r.error.includes('declined'));
});
