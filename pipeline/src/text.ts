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
