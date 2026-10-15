import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { logFrontmatterSchema, type LogFrontmatter } from './log-schema.ts';

// Flight-log markdown ⇄ structured frontmatter. One direction serializes an
// approved submission into the exact file that gets committed to
// src/content/logs/<slug>.md; the other reads a live file back so an edit
// submission can prefill from it. The YAML library handles all escaping.

// Fixed key order so committed files read like the hand-written ones and
// diffs stay stable. Optional keys are emitted only when present.
const KEY_ORDER: (keyof LogFrontmatter)[] = [
  'title', 'date', 'rider', 'mount', 'model', 'harness', 'task',
  'duration', 'cost_usd', 'outcome', 'burns', 'lesson', 'reins', 'draft',
];

function orderFrontmatter(fm: LogFrontmatter): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of KEY_ORDER) {
    const value = fm[key];
    if (value === undefined) continue;
    // Drop empty optional strings rather than writing model: ""
    if ((key === 'model' || key === 'harness') && value === '') continue;
    out[key] = value;
  }
  return out;
}

/**
 * A validated LogFrontmatter + body → the full markdown file content.
 * `date` is forced to a quoted string so YAML never reinterprets it as a
 * timestamp; the content collection coerces it back to a Date.
 */
export function serializeLog(fm: LogFrontmatter, body: string): string {
  const ordered = orderFrontmatter(fm);
  const yaml = stringifyYaml(ordered, {
    lineWidth: 0, // never wrap long strings — keeps values on one line
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
  });
  const trimmedBody = body.replace(/\s+$/, '');
  return `---\n${yaml}---\n\n${trimmedBody}${trimmedBody ? '\n' : ''}`;
}

export type ParsedLog = { frontmatter: unknown; body: string };

/**
 * Split a flight-log markdown file into raw frontmatter + body. Dates that
 * YAML parsed as Date objects (unquoted timestamps in older files) are
 * normalized to ISO yyyy-mm-dd strings so the shared schema accepts them.
 * Returns the raw object; callers validate with logFrontmatterSchema.
 */
export function parseLog(markdown: string): ParsedLog {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(markdown);
  if (!match) throw new Error('No frontmatter block found.');
  const raw = parseYaml(match[1]) as Record<string, unknown>;
  if (raw && raw.date instanceof Date) {
    raw.date = raw.date.toISOString().slice(0, 10);
  }
  return { frontmatter: raw, body: (match[2] ?? '').replace(/^\n+/, '') };
}

/** Parse + validate in one step; throws a zod error on a bad file. */
export function parseAndValidateLog(markdown: string): { frontmatter: LogFrontmatter; body: string } {
  const { frontmatter, body } = parseLog(markdown);
  return { frontmatter: logFrontmatterSchema.parse(frontmatter), body };
}
