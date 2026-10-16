// Slug + enum helpers — a plain-JS mirror of src/lib/log-schema.ts. The MCP
// can't import the TypeScript schema at runtime (Node 18/20 don't strip
// types), so these are duplicated here and pinned to the originals by a
// round-trip test (tests/mcp-draft.test.ts) that imports both and compares.

export const TASK_VALUES = ['code', 'ops', 'research', 'sales', 'writing', 'data', 'other'];
export const OUTCOME_VALUES = ['landed', 'partial', 'aborted'];
export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

export function slugify(input) {
  return String(input)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
    .replace(/-$/, '');
}

export function isValidSlug(slug) {
  return SLUG_REGEX.test(slug);
}
