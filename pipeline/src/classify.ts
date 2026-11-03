// Outcome classification — deterministic, no LLM (brief, Pipeline step 6).
//
//   merged_clean        merged, no changes requested, one review round
//   merged_after_rework merged after ≥1 changes-requested review, or ≥2
//                       commits pushed after the first review
//   burn                closed unmerged with ≥1 review or comment from a
//                       human who is not the author
//   abandoned           closed unmerged with no human engagement
//   open                open under 30 days
//   stale               open 30 days or more
//
// Every input is a stored field on the flight, so a re-run needs no re-fetch.

export type Outcome =
  | 'merged_clean'
  | 'merged_after_rework'
  | 'burn'
  | 'abandoned'
  | 'open'
  | 'stale';

export type ClassifyInput = {
  state: 'open' | 'merged' | 'closed';
  openedAt: string | null;
  changeRequests: number;
  humanReviewCount: number;
  humanCommentCount: number;
  commitsAfterFirstReview: number;
};

export const STALE_DAYS = 30;

export function classifyOutcome(input: ClassifyInput, now = new Date()): Outcome {
  if (input.state === 'merged') {
    const reworked = input.changeRequests >= 1 || input.commitsAfterFirstReview >= 2;
    return reworked ? 'merged_after_rework' : 'merged_clean';
  }
  if (input.state === 'closed') {
    const humanEngaged = input.humanReviewCount >= 1 || input.humanCommentCount >= 1;
    return humanEngaged ? 'burn' : 'abandoned';
  }
  const opened = input.openedAt ? Date.parse(input.openedAt) : NaN;
  if (Number.isFinite(opened)) {
    const ageDays = (now.getTime() - opened) / 86_400_000;
    if (ageDays >= STALE_DAYS) return 'stale';
  }
  return 'open';
}

export type ExcerptCandidate = {
  kind: 'review' | 'comment';
  /** Review verdict, uppercased GitHub state; comments have none. */
  state?: string | null;
  authorLogin: string | null;
  authorIsBot: boolean;
  body: string | null;
  createdAt: string | null;
  url: string | null;
};

/**
 * The reviewer excerpt for burns and rework: the earliest changes-requested
 * review, else the earliest comment or review by a non-author human — first
 * 25 words, verbatim, with its URL (brief, Pipeline step 6).
 */
export function pickReviewerExcerpt(
  candidates: ExcerptCandidate[],
  prAuthorLogin: string | null,
  firstWords: (text: string, n?: number) => string,
): { excerpt: string; url: string | null } | null {
  const author = (prAuthorLogin ?? '').toLowerCase();
  const withBody = candidates.filter(
    (c) => c.body && c.body.trim().length > 0 && (c.authorLogin ?? '').toLowerCase() !== author,
  );
  const byTime = (a: ExcerptCandidate, b: ExcerptCandidate) =>
    (a.createdAt ?? '').localeCompare(b.createdAt ?? '');

  const changesRequested = withBody
    .filter((c) => !c.authorIsBot && c.kind === 'review' && (c.state ?? '').toUpperCase() === 'CHANGES_REQUESTED')
    .sort(byTime);
  const humans = withBody.filter((c) => !c.authorIsBot).sort(byTime);

  const pick = changesRequested[0] ?? humans[0];
  if (!pick?.body) return null;
  // ≤25 words, verbatim. Degenerate "words" (minified code, long URLs) are
  // dropped from the tail until the excerpt fits the stored bound; a single
  // monster token yields no excerpt rather than a mangled one.
  let excerpt = firstWords(pick.body, 25);
  while (excerpt.length > 700 && excerpt.includes(' ')) {
    excerpt = excerpt.slice(0, excerpt.lastIndexOf(' '));
  }
  if (excerpt.length === 0 || excerpt.length > 700) return null;
  return { excerpt, url: pick.url ?? null };
}
