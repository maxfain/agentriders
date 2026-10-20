import { slugify } from './facets.ts';
import { PENDING_HANDLE_PREFIX } from './handles.ts';

// The mount catalogue — the agents a rider can say they ride — and the readers
// that turn published flights into counts. Two evidential tiers run through
// every surface built on this file: "named on published flights" (counted,
// from published_logs only) and "rides" (declared on /me/profile/, never
// counted, never read by ranks.ts). A flight's mount is rider-asserted
// (mcp/tools/draft.js defaults it), so even the counted tier is a claim a
// reviewer saw, not a verified fact; nothing here mixes it with `verified`.
//
// Slugs come from facets.ts slugify — the key of /logs/mount/<slug>/ — and
// never from log-schema.ts, whose slugify drops dots ("v4.1" → v41 there,
// v4-1 here), so a mount named on a flight and the facet page it links to
// can't disagree. The seed carries no logos and no config paths beyond the
// three notes /start already shows; GENERIC_STDIO_NOTE covers every other
// client without naming a file, so the gating step never shows a path we
// don't maintain.
//
// Erasable TypeScript — imported directly by node --test. The D1 readers
// touch only columns migration 0002 adds, so each returns empty on any
// failure: a database still on 0001 renders a page without mounts, never a
// 500.

export type MountKind = 'stdio' | 'remote' | 'harness';
export type MountCategory =
  | 'Coding agent'
  | 'Desktop'
  | 'Chat'
  | 'Cloud agent'
  | 'Automation'
  | 'Framework'
  | 'Custom';
export type MountDef = {
  name: string;
  slug: string;
  vendor?: string;
  category: MountCategory;
  kind: MountKind;
  /** HTML fragment with its own <code> tags (render with set:html). Only the /start tabs carry one. */
  note?: string;
};

// Seed order is display order: the clients that can run the MCP server
// first, the harnesses that can't last, and within a category the ones we
// expect to see on a flight most often. Slugs are computed, never typed, so
// the catalogue and the facet pages share one spelling by construction.
const SEED: Omit<MountDef, 'slug'>[] = [
  // Coding agents (stdio). The two notes are the ones /start has shown since
  // its tabs landed — copied, not reworded, so the gating step can't drift.
  { name: 'Claude Code', vendor: 'Anthropic', category: 'Coding agent', kind: 'stdio', note: 'Project file <code>.mcp.json</code> at the repo root (or run <code>claude mcp add</code>). The same <code>mcpServers</code> block.' },
  { name: 'Cursor', vendor: 'Anysphere', category: 'Coding agent', kind: 'stdio', note: 'Project <code>.cursor/mcp.json</code> or global <code>~/.cursor/mcp.json</code>. Cursor accepts an optional <code>"type": "stdio"</code> on the <code>agentriders</code> entry.' },
  { name: 'Codex CLI', vendor: 'OpenAI', category: 'Coding agent', kind: 'stdio' },
  { name: 'Gemini CLI', vendor: 'Google', category: 'Coding agent', kind: 'stdio' },
  { name: 'GitHub Copilot', vendor: 'GitHub', category: 'Coding agent', kind: 'stdio' },
  { name: 'Windsurf', vendor: 'Codeium', category: 'Coding agent', kind: 'stdio' },
  { name: 'Cline', category: 'Coding agent', kind: 'stdio' },
  { name: 'Aider', category: 'Coding agent', kind: 'stdio' },
  { name: 'Kiro', vendor: 'AWS', category: 'Coding agent', kind: 'stdio' },
  { name: 'VS Code', vendor: 'Microsoft', category: 'Coding agent', kind: 'stdio' },
  // Desktop (stdio). Note as /agents has always put it.
  { name: 'Claude Desktop', vendor: 'Anthropic', category: 'Desktop', kind: 'stdio', note: '<code>claude_desktop_config.json</code> → the same <code>mcpServers</code> block.' },
  // Chat (remote) — can't launch a local server; /start sends them to the
  // by-hand fork rather than pretend a config note exists.
  { name: 'ChatGPT', vendor: 'OpenAI', category: 'Chat', kind: 'remote' },
  { name: 'Claude.ai', vendor: 'Anthropic', category: 'Chat', kind: 'remote' },
  // Cloud agents (remote)
  { name: 'Devin', vendor: 'Cognition', category: 'Cloud agent', kind: 'remote' },
  { name: 'OpenClaw', category: 'Cloud agent', kind: 'remote' },
  { name: 'Jules', vendor: 'Google', category: 'Cloud agent', kind: 'remote' },
  // Automation (harness)
  { name: 'n8n', category: 'Automation', kind: 'harness' },
  { name: 'Zapier', category: 'Automation', kind: 'harness' },
  { name: 'Make', category: 'Automation', kind: 'harness' },
  // Frameworks (harness)
  { name: 'LangGraph', vendor: 'LangChain', category: 'Framework', kind: 'harness' },
  { name: 'OpenAI Agents SDK', vendor: 'OpenAI', category: 'Framework', kind: 'harness' },
  { name: 'Claude Agent SDK', vendor: 'Anthropic', category: 'Framework', kind: 'harness' },
  // Custom (harness) — the record's own "Custom agent" resolves here.
  { name: 'Custom agent', category: 'Custom', kind: 'harness' },
];

export const MOUNTS: MountDef[] = SEED.map((m) => ({ ...m, slug: slugify(m.name) }));

const BY_SLUG = new Map(MOUNTS.map((m) => [m.slug, m]));

// The "Other MCP client" tab on /start. Names clients, never files: a path we
// don't maintain on the gating step is a path that goes stale unnoticed.
export const GENERIC_STDIO_NOTE =
  "Any MCP client that launches a local stdio server by command — Codex CLI, Gemini CLI, VS Code, Windsurf, Cline — takes the same block; check your client's MCP settings for the file it reads.";

// Spellings riders reach for that slugify to something the catalogue doesn't
// hold. Keyed and valued by slug. Applied to declared rides only (profile.ts),
// never to a flight's mount_slug: the facet page is keyed on the record's own
// spelling, and renaming a flight's chip would point it at the wrong page.
export const ALIASES: Record<string, string> = {
  cc: 'claude-code',
  'claude-code-cli': 'claude-code',
  codex: 'codex-cli',
  vscode: 'vs-code',
  copilot: 'github-copilot',
};

/** The alias target for a slug, or the slug itself. hasOwn, so a rider typing "constructor" gets a slug, not Object's. */
export function canonicalSlug(slug: string): string {
  return Object.hasOwn(ALIASES, slug) ? ALIASES[slug] : slug;
}

export function mountBySlug(slug: string): MountDef | undefined {
  return BY_SLUG.get(slug);
}

/**
 * Display name for a slug: the catalogue's when seeded, else the fallback (a
 * flight's own spelling). Counts arrive through MIN(mount), which is BINARY
 * in SQLite — without this, 'CLAUDE CODE' on one flight would rename a chip.
 */
export function mountName(slug: string, fallback: string): string {
  return BY_SLUG.get(slug)?.name ?? fallback;
}

/** The /start tabs: every seed entry with a config note, in seed order. */
export function startMounts(): MountDef[] {
  return MOUNTS.filter((m) => m.note !== undefined);
}

/**
 * Normalize a mount string the way every writer and validator must: whitespace
 * collapsed, control characters gone, 80 chars at most. Non-strings (a
 * frontmatter with no mount) come back empty, so callers bind NULL on ''.
 */
export function cleanMount(s: unknown): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 80)
    .trim();
}

export type MountCount = { name: string; riders: number; flights: number };
export type FlownMount = { slug: string; name: string; flights: number };
export type MergedMount = { slug: string; name: string; flights: number | null };
export type PickerEntry = { slug: string; name: string; riders: number; flights: number; catalogued: boolean };

const byName = (a: { name: string }, b: { name: string }) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/**
 * Every mount named on a published flight, with how many flights and riders
 * named it — from published_logs only, never rider_mounts. The JOIN drops
 * legacy rows with no rider; banned and pending riders are excluded so a
 * chip can't be propped up by an account that isn't in the record. Ordered
 * by flights, so iterating the Map gives chip order and a click can't
 * promote a mount. Per-request, no cache; under-reports before the backfill,
 * never over-reports.
 */
export async function mountCounts(db: D1Database): Promise<Map<string, MountCount>> {
  const out = new Map<string, MountCount>();
  try {
    const rows =
      (
        await db
          .prepare(
            `SELECT p.mount_slug AS slug, MIN(p.mount) AS name, COUNT(*) AS flights, COUNT(DISTINCT p.rider_id) AS riders
             FROM published_logs p JOIN riders r ON r.id = p.rider_id
             WHERE p.mount_slug IS NOT NULL AND r.banned_at IS NULL AND r.handle NOT LIKE ?
             GROUP BY p.mount_slug
             ORDER BY flights DESC, riders DESC, slug ASC`,
          )
          .bind(`${PENDING_HANDLE_PREFIX}%`)
          .all<{ slug: string; name: string | null; flights: number; riders: number }>()
      ).results ?? [];
    for (const r of rows) {
      out.set(r.slug, { name: mountName(r.slug, r.name ?? r.slug), riders: r.riders, flights: r.flights });
    }
  } catch {
    /* pre-0002 (no mount_slug column): no counts, never a 500 */
  }
  return out;
}

/**
 * One rider's flown mounts for their profile: grouped with counts (flights
 * desc) for the MOUNTS block, plus log slug → mount name for the per-flight
 * meta line. The flights SELECT the profile already runs stays untouched;
 * this is a second, best-effort read of the same rows.
 */
export async function riderFlown(
  db: D1Database,
  riderId: string,
): Promise<{ flown: FlownMount[]; mountByLog: Map<string, string> }> {
  const flown: FlownMount[] = [];
  const mountByLog = new Map<string, string>();
  try {
    const rows =
      (
        await db
          .prepare(
            `SELECT slug, mount, mount_slug FROM published_logs
             WHERE rider_id = ? AND mount_slug IS NOT NULL
             ORDER BY published_at DESC, slug ASC`,
          )
          .bind(riderId)
          .all<{ slug: string; mount: string | null; mount_slug: string }>()
      ).results ?? [];
    const grouped = new Map<string, FlownMount>();
    for (const r of rows) {
      const name = mountName(r.mount_slug, r.mount ?? r.mount_slug);
      mountByLog.set(r.slug, name);
      const cur = grouped.get(r.mount_slug);
      if (cur) cur.flights += 1;
      else grouped.set(r.mount_slug, { slug: r.mount_slug, name, flights: 1 });
    }
    flown.push(...[...grouped.values()].sort((a, b) => b.flights - a.flights || byName(a, b)));
  } catch {
    /* pre-0002: a profile without mounts, never a 500 */
  }
  return { flown, mountByLog };
}

/**
 * Flown mounts for every rider at once — the directory's per-row chips in a
 * single grouped query rather than one per roster row. Each rider's list is
 * flights desc, so "top 3" is a slice. Riders not on the roster are simply
 * never looked up; the roster's own filters decide who shows.
 */
export async function directoryFlown(db: D1Database): Promise<Map<string, FlownMount[]>> {
  const out = new Map<string, FlownMount[]>();
  try {
    const rows =
      (
        await db
          .prepare(
            `SELECT rider_id, mount_slug AS slug, MIN(mount) AS name, COUNT(*) AS flights
             FROM published_logs
             WHERE rider_id IS NOT NULL AND mount_slug IS NOT NULL
             GROUP BY rider_id, mount_slug
             ORDER BY rider_id ASC, flights DESC, slug ASC`,
          )
          .all<{ rider_id: string; slug: string; name: string | null; flights: number }>()
      ).results ?? [];
    for (const r of rows) {
      const list = out.get(r.rider_id) ?? [];
      list.push({ slug: r.slug, name: mountName(r.slug, r.name ?? r.slug), flights: r.flights });
      out.set(r.rider_id, list);
    }
  } catch {
    /* pre-0002: a directory without chips, never a 500 */
  }
  return out;
}

/**
 * The profile's MOUNTS block: flown first (flights desc), then rides in the
 * order the rider declared them. A ride shows only when its slug is catalogued
 * or already named on a published flight (`publicSlugs`, the keys of
 * mountCounts), so free text nobody flew never reaches an indexable page. A
 * slug that is both flown and declared renders once, with its count.
 */
export function mergeMounts(
  flown: FlownMount[],
  rides: { slug: string; name: string }[],
  publicSlugs: Set<string>,
): MergedMount[] {
  const out: MergedMount[] = [];
  const seen = new Set<string>();
  for (const f of [...flown].sort((a, b) => b.flights - a.flights)) {
    if (seen.has(f.slug)) continue;
    seen.add(f.slug);
    out.push({ slug: f.slug, name: f.name, flights: f.flights });
  }
  for (const r of rides) {
    if (seen.has(r.slug)) continue;
    if (!BY_SLUG.has(r.slug) && !publicSlugs.has(r.slug)) continue;
    seen.add(r.slug);
    out.push({ slug: r.slug, name: r.name, flights: null });
  }
  return out;
}

/**
 * The /me/profile/ picker: the catalogue plus every slug the record has
 * named, ordered flights desc, riders desc, seed order, name — so counts
 * decide the order and, at zero, the seed does. Uncatalogued entries keep the
 * record's spelling and say so (`catalogued: false`).
 */
export function pickerList(counts: Map<string, MountCount>): PickerEntry[] {
  const seedIndex = new Map(MOUNTS.map((m, i) => [m.slug, i]));
  const entries: PickerEntry[] = MOUNTS.map((m) => {
    const c = counts.get(m.slug);
    return { slug: m.slug, name: m.name, riders: c?.riders ?? 0, flights: c?.flights ?? 0, catalogued: true };
  });
  for (const [slug, c] of counts) {
    if (seedIndex.has(slug)) continue;
    entries.push({ slug, name: c.name, riders: c.riders, flights: c.flights, catalogued: false });
  }
  const order = (e: PickerEntry) => seedIndex.get(e.slug) ?? MOUNTS.length;
  return entries.sort(
    (a, b) => b.flights - a.flights || b.riders - a.riders || order(a) - order(b) || byName(a, b),
  );
}
