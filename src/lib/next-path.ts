// Post-login bounce targets for /api/auth/github?next=… — site-relative
// paths on surfaces that carry a sign-in CTA (flight pages, author pages,
// opt-out, the claims manager). Anything else falls back to the default /join/ → /me/
// flow. Erasable TypeScript; node --test imports it directly.

export const OAUTH_NEXT_COOKIE = 'ar_oauth_next';

export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null;
  const path = next.split(/[?#]/)[0];
  if (/^\/logs\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/\d+\/$/.test(path)) return path;
  if (/^\/logs\/author\/[a-z0-9-]+\/$/.test(path)) return path; // author pages are lowercase
  if (path === '/opt-out/' || path === '/me/flights/') return path;
  return null;
}
