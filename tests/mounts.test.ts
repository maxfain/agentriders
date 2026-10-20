import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/lib/facets.ts';
import { slugify as logSchemaSlugify } from '../src/lib/log-schema.ts';
import {
  MOUNTS,
  GENERIC_STDIO_NOTE,
  ALIASES,
  canonicalSlug,
  mountBySlug,
  mountName,
  startMounts,
  cleanMount,
  mergeMounts,
  pickerList,
} from '../src/lib/mounts.ts';

// Pure catalogue + merge/picker rules. The D1 readers (mountCounts,
// riderFlown, directoryFlown) are exercised by the live e2e; here we pin what
// the pages can rely on without a database.

test('catalogue: slugs are unique and computed from names with the facets slugify', () => {
  const slugs = MOUNTS.map((m) => m.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const m of MOUNTS) {
    assert.equal(m.slug, slugify(m.name), m.name);
    assert.match(m.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, m.name);
    assert.ok(m.name.length <= 40, m.name); // a catalogue name must pass the ride validator
  }
  assert.ok(MOUNTS.length >= 20);
});

test('catalogue: the facets slugify keeps a dotted version apart; log-schema would not', () => {
  // /logs/mount/<slug>/ is keyed on facets.ts. log-schema.ts drops the dot,
  // so a mount written with it would link to a page that doesn't exist.
  assert.equal(slugify('v4.1'), 'v4-1');
  assert.equal(logSchemaSlugify('v4.1'), 'v41');
  assert.equal(slugify('Claude.ai'), 'claude-ai');
});

test("catalogue: the record's mounts resolve, or keep their own slug", () => {
  assert.equal(mountBySlug(slugify('Claude Code'))?.name, 'Claude Code');
  assert.equal(mountBySlug(slugify('Custom agent'))?.name, 'Custom agent');
  // "n8n + Claude" has its own facet page — it must not collapse onto n8n.
  assert.equal(slugify('n8n + Claude'), 'n8n-claude');
  assert.equal(mountBySlug('n8n-claude'), undefined);
  assert.notEqual(slugify('n8n + Claude'), slugify('n8n'));
  assert.equal(mountBySlug('nope'), undefined);
});

test('startMounts: exactly the three entries with a config note, in seed order', () => {
  assert.deepEqual(
    startMounts().map((m) => m.name),
    ['Claude Code', 'Cursor', 'Claude Desktop'],
  );
  for (const m of startMounts()) assert.ok(m.note && m.note.length > 0, m.name);
  assert.equal(MOUNTS.filter((m) => m.note !== undefined).length, 3);
  // Every tab is a local stdio client — the remote ones can't run the server.
  for (const m of startMounts()) assert.equal(m.kind, 'stdio', m.name);
});

test('GENERIC_STDIO_NOTE names clients, never a config file path', () => {
  assert.doesNotMatch(GENERIC_STDIO_NOTE, /\.json|~\/|<code>/);
  assert.match(GENERIC_STDIO_NOTE, /check your client's MCP settings/);
});

test("mountName: the catalogue spelling wins over a flight's; fallback otherwise", () => {
  assert.equal(mountName('claude-code', 'CLAUDE CODE'), 'Claude Code');
  assert.equal(mountName('n8n-claude', 'n8n + Claude'), 'n8n + Claude');
});

test('ALIASES: every target is catalogued, no key is; canonicalSlug is hasOwn-safe', () => {
  for (const [from, to] of Object.entries(ALIASES)) {
    assert.ok(mountBySlug(to), `${from} → ${to}`);
    assert.equal(mountBySlug(from), undefined, from);
    assert.equal(canonicalSlug(from), to);
  }
  assert.equal(canonicalSlug('cc'), 'claude-code');
  assert.equal(canonicalSlug('cursor'), 'cursor');
  assert.equal(canonicalSlug('constructor'), 'constructor');
  assert.equal(canonicalSlug('toString'), 'toString');
});

test('cleanMount: strips controls, collapses whitespace, caps at 80', () => {
  assert.equal(cleanMount('  Claude\t\n Code \u0000'), 'Claude Code');
  assert.equal(cleanMount('a\u0007b\u007f'), 'ab');
  assert.equal(cleanMount('x'.repeat(100)).length, 80);
  // the cap never leaves a trailing space behind
  assert.equal(cleanMount('x'.repeat(79) + ' y'), 'x'.repeat(79));
  assert.equal(cleanMount('Cursor'), 'Cursor');
  assert.equal(cleanMount(''), '');
  assert.equal(cleanMount('   '), '');
  assert.equal(cleanMount(undefined), '');
  assert.equal(cleanMount(null), '');
  assert.equal(cleanMount(42), '');
});

test('mergeMounts: flown first by flights desc, then rides in rider order, no duplicates', () => {
  const flown = [
    { slug: 'custom-agent', name: 'Custom agent', flights: 1 },
    { slug: 'claude-code', name: 'Claude Code', flights: 3 },
  ];
  const rides = [
    { slug: 'cursor', name: 'Cursor' }, // catalogued, not flown → ride
    { slug: 'claude-code', name: 'Claude Code' }, // also flown → once, with its count
    { slug: 'my-bespoke-thing', name: 'My bespoke thing' }, // nobody flew it → dropped
    { slug: 'n8n-claude', name: 'n8n + Claude' }, // uncatalogued but in the record → ride
  ];
  const merged = mergeMounts(flown, rides, new Set(['claude-code', 'custom-agent', 'n8n-claude']));
  assert.deepEqual(merged, [
    { slug: 'claude-code', name: 'Claude Code', flights: 3 },
    { slug: 'custom-agent', name: 'Custom agent', flights: 1 },
    { slug: 'cursor', name: 'Cursor', flights: null },
    { slug: 'n8n-claude', name: 'n8n + Claude', flights: null },
  ]);
});

test('mergeMounts: empty inputs; rides alone keep rider order; flown input is not mutated', () => {
  assert.deepEqual(mergeMounts([], [], new Set()), []);
  const rides = [
    { slug: 'aider', name: 'Aider' },
    { slug: 'cursor', name: 'Cursor' },
  ];
  assert.deepEqual(
    mergeMounts([], rides, new Set()).map((m) => m.slug),
    ['aider', 'cursor'],
  );
  const flown = [
    { slug: 'a', name: 'A', flights: 1 },
    { slug: 'b', name: 'B', flights: 2 },
  ];
  mergeMounts(flown, [], new Set());
  assert.deepEqual(flown.map((f) => f.slug), ['a', 'b']);
  // a flown slug repeated by a sloppy caller still renders once
  assert.equal(mergeMounts([flown[1], flown[1]], [], new Set()).length, 1);
});

test('pickerList: catalogue ∪ record slugs; flights desc, riders desc, seed order, name', () => {
  const counts = new Map([
    ['n8n-claude', { name: 'n8n + Claude', riders: 1, flights: 1 }],
    ['custom-agent', { name: 'Custom agent', riders: 1, flights: 1 }],
    ['claude-code', { name: 'Claude Code', riders: 1, flights: 2 }],
  ]);
  const list = pickerList(counts);
  assert.equal(list.length, MOUNTS.length + 1);
  // 2 flights first; at 1 flight · 1 rider the seeded entry precedes the unseeded one
  assert.deepEqual(
    list.slice(0, 3).map((e) => e.slug),
    ['claude-code', 'custom-agent', 'n8n-claude'],
  );
  assert.deepEqual(
    list.find((e) => e.slug === 'n8n-claude'),
    { slug: 'n8n-claude', name: 'n8n + Claude', riders: 1, flights: 1, catalogued: false },
  );
  // the rest is the seed, in seed order, at zero
  const rest = list.slice(3);
  assert.deepEqual(
    rest.map((e) => e.slug),
    MOUNTS.filter((m) => !counts.has(m.slug)).map((m) => m.slug),
  );
  for (const e of rest) assert.deepEqual([e.flights, e.riders, e.catalogued], [0, 0, true]);
});

test('pickerList: empty counts is the seed in seed order; riders break a flights tie; name breaks the rest', () => {
  const seed = pickerList(new Map());
  assert.deepEqual(seed.map((e) => e.slug), MOUNTS.map((m) => m.slug));
  assert.ok(seed.every((e) => e.catalogued && e.flights === 0 && e.riders === 0));

  const list = pickerList(
    new Map([
      ['zeta-agent', { name: 'Zeta agent', riders: 1, flights: 1 }],
      ['alpha-agent', { name: 'Alpha agent', riders: 1, flights: 1 }],
      ['aider', { name: 'Aider', riders: 2, flights: 1 }],
      ['cursor', { name: 'Cursor', riders: 1, flights: 1 }],
    ]),
  );
  assert.deepEqual(
    list.slice(0, 4).map((e) => e.slug),
    ['aider', 'cursor', 'alpha-agent', 'zeta-agent'],
  );
});

test('pickerList: a catalogued slug keeps the catalogue name whatever spelling the counts carry', () => {
  const list = pickerList(new Map([['claude-code', { name: 'CLAUDE CODE', riders: 1, flights: 1 }]]));
  assert.equal(list[0].slug, 'claude-code');
  assert.equal(list[0].name, 'Claude Code');
  assert.equal(list[0].catalogued, true);
});
