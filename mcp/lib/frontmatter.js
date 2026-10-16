// Frontmatter serialize/parse for the draft/file round-trip. The draft tool
// serializes the fields to the exact markdown file that would be committed;
// the file tool re-parses the markdown it is handed (never trusting a stale
// draft) back into the composer payload it POSTs.

import YAML from 'yaml';

export function toMarkdown(frontmatter, body = '') {
  const fm = YAML.stringify(frontmatter).trimEnd();
  const b = String(body || '').trim();
  return `---\n${fm}\n---\n${b ? `\n${b}\n` : '\n'}`;
}

export function parseMarkdown(md) {
  const m = String(md).match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error('No frontmatter block found (expected a leading --- … --- section).');
  const frontmatter = YAML.parse(m[1]) ?? {};
  const body = String(m[2] ?? '').trim();
  return { frontmatter, body };
}
