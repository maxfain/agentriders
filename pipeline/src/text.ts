// Text rules the brief fixes exactly: 300-character body excerpts, 25-word
// verbatim reviewer excerpts. Code points, not UTF-16 units, so an excerpt
// never cuts a surrogate pair.

export function excerpt300(body: string | null | undefined): {
  excerpt: string | null;
  chars: number;
} {
  if (!body) return { excerpt: null, chars: 0 };
  const text = body.replace(/\r\n/g, '\n').trim();
  const chars = Array.from(text);
  if (chars.length === 0) return { excerpt: null, chars: 0 };
  return { excerpt: chars.slice(0, 300).join(''), chars: chars.length };
}

/** First `n` words, verbatim (whitespace collapsed to single spaces). */
export function firstWords(text: string, n = 25): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, n).join(' ');
}

/** Count words the way the debrief validator does. */
export function wordCount(text: string): number {
  return (text.trim().match(/\S+/g) ?? []).length;
}

/** Hours between two ISO timestamps, 2 decimals; null when either is missing. */
export function hoursBetween(from?: string | null, to?: string | null): number | null {
  if (!from || !to) return null;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round(((b - a) / 36e5) * 100) / 100;
}

/**
 * The first readable paragraph of a profile README as plain text, at most 25
 * words (the corpus's verbatim-excerpt bound, ≤300 characters): HTML and
 * comments, images and badges, code, headings, list markers, link syntax and
 * emphasis are stripped first. Nothing readable → null.
 */
export function readmeExcerpt(markdown: string | null | undefined): string | null {
  if (!markdown) return null;
  const text = markdown
    .replace(/\r\n/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, '') // linked badges
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // images, badges
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ') // any other tag
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links → their text
    .replace(/^[ \t]{0,3}#{1,6}[ \t].*$/gm, '') // heading lines, whole
    .replace(/^[ \t]*[-*+][ \t]+/gm, '') // list markers
    .replace(/^[ \t]*>[ \t]?/gm, '') // blockquotes
    .replace(/[*_`~]+/g, '') // emphasis, code spans, strikethrough
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
  for (const block of text.split(/\n[ \t]*\n/)) {
    // Collapse whitespace; a tag replaced by a space must not leave "Jane ,".
    const para = block.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
    // Needs words, not a bare URL, an emoji row or a leftover separator.
    if (para.length < 12 || !/[A-Za-z]{3}/.test(para) || /^https?:\/\/\S+$/.test(para)) continue;
    let excerpt = firstWords(para, 25);
    while (excerpt.length > 300 && excerpt.includes(' ')) excerpt = excerpt.slice(0, excerpt.lastIndexOf(' '));
    return excerpt.length > 0 && excerpt.length <= 300 ? excerpt : null;
  }
  return null;
}
