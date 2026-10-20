import { slugify } from './facets.ts';
import { canonicalSlug, cleanMount, mountBySlug } from './mounts.ts';

// The rider-typed half of a profile: display name, a one-line bio, the mounts
// they declare (rides), and whether the GitHub login captured at sign-in
// shows. Validation lives here, pure and tested, so PUT /api/me/profile stays
// a thin shell — parse JSON, validateProfileInput, one bound batch — and every
// error string is the copy the editor shows verbatim.
//
// Links are refused in the bio and in mounts on purpose: a profile is a claim,
// and the only links a rider earns are the flights the record publishes. The
// GitHub login is the one identity we show because OAuth proved it; it is
// never typed, and it goes stale (GITHUB_FRESH_DAYS) rather than living on a
// sign-in from years ago.
//
// Erasable TypeScript. readProfileExtras reads only columns migration 0002
// adds, so it returns the defaults on any failure — github_public defaults to
// 1 because showing the login is opt-out — and a database still on 0001
// never 500s.

export type ProfileExtras = {
  github_login: string | null;
  github_login_at: string | null;
  github_public: number;
  rides: { slug: string; name: string }[];
};

/** The shape PUT /api/me/profile writes: riders columns by name, rides as rows. */
export type ProfilePatch = {
  display_name?: string;
  bio?: string | null;
  github_public?: 0 | 1;
  mounts?: { slug: string; name: string }[];
};

export type ProfileValidation = { ok: true; patch: ProfilePatch } | { ok: false; error: string };

const EMPTY_EXTRAS = (): ProfileExtras => ({ github_login: null, github_login_at: null, github_public: 1, rides: [] });

export async function readProfileExtras(db: D1Database, riderId: string): Promise<ProfileExtras> {
  try {
    // One batch, one round trip; D1 runs it as a unit, so a missing column
    // fails both statements together and the catch below returns the defaults.
    const [riderRes, ridesRes] = await db.batch<Record<string, unknown>>([
      db.prepare('SELECT github_login, github_login_at, github_public FROM riders WHERE id = ?').bind(riderId),
      db.prepare('SELECT mount_slug, mount FROM rider_mounts WHERE rider_id = ? ORDER BY position').bind(riderId),
    ]);
    const r = (riderRes.results?.[0] ?? null) as {
      github_login: string | null;
      github_login_at: string | null;
      github_public: number | null;
    } | null;
    const rides = ((ridesRes.results ?? []) as { mount_slug: string; mount: string }[]).map((m) => ({
      slug: m.mount_slug,
      name: m.mount,
    }));
    return {
      github_login: r?.github_login ?? null,
      github_login_at: r?.github_login_at ?? null,
      github_public: r?.github_public ?? 1,
      rides,
    };
  } catch {
    return EMPTY_EXTRAS();
  }
}

export const GITHUB_FRESH_DAYS = 180;
const DAY_MS = 86_400_000;

/** A GitHub link is shown only while the last GitHub sign-in is inside the window. */
export function githubLinkFresh(loginAt: string | null, now = Date.now()): boolean {
  if (!loginAt) return false;
  const t = Date.parse(loginAt);
  if (Number.isNaN(t)) return false;
  return now - t <= GITHUB_FRESH_DAYS * DAY_MS;
}

// Anything that reads as a URL: a scheme, a www., or a word.tld from the TLDs
// people actually paste. Deliberately coarse — a bio that trips it can be
// reworded; a profile that links out is the thing we refuse.
export const LINKISH =
  /(:\/\/|\bwww\.|\b[a-z0-9-]+\.(com|net|org|io|ai|dev|app|co|me|xyz|sh|so|gg|tv|info|biz|us|uk|de|fr|es|it|nl|ca|au|in|br|jp|eu)\b)/i;

export const DISPLAY_NAME_MAX = 60;
export const BIO_MAX = 160;
export const MOUNT_MAX = 40;
export const MOUNTS_MAX = 8;

// A product name: starts alphanumeric, then the characters real names use
// ("n8n + Claude", "VS Code", "Claude.ai", "Make (Integromat)").
const MOUNT_RE = /^[A-Za-z0-9][A-Za-z0-9 .+/()&_-]*$/;

const ERR_JSON = 'Send JSON.';
const ERR_MOUNTS_SHAPE = 'Send mounts as a list.';
const ERR_GITHUB_SHAPE = 'Send githubPublic as true or false.';
const ERR_DISPLAY_NAME = 'Display name: 1 to 60 characters.';
const ERR_BIO_LENGTH = 'One line, 160 characters at most.';
const ERR_BIO_LINK = 'Links go in your flights, not your bio.';
const ERR_MOUNTS_MANY = 'Eight mounts is plenty.';
const ERR_MOUNT = 'A mount is a product name, not a link.';

/**
 * Validate a PUT /api/me/profile body into a patch. Missing keys mean
 * "unchanged", unknown keys are ignored, and `githubPublic` is dropped
 * entirely when the rider has no GitHub login to show. `ctx.record` is the
 * mounts published flights already name (mountCounts), accepted the way the
 * picker offers them. Patch keys are the column whitelist; the API binds the
 * values.
 */
export function validateProfileInput(
  body: unknown,
  ctx: { hasGithubLogin: boolean; record?: ReadonlyMap<string, { name: string }> },
): ProfileValidation {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, error: ERR_JSON };
  const b = body as Record<string, unknown>;
  const patch: ProfilePatch = {};

  if (Object.hasOwn(b, 'displayName')) {
    const raw = typeof b.displayName === 'string' ? b.displayName : '';
    const name = raw.replace(/[\u0000-\u001f<>]/g, '').trim();
    if (name.length < 1 || name.length > DISPLAY_NAME_MAX) return { ok: false, error: ERR_DISPLAY_NAME };
    patch.display_name = name;
  }

  if (Object.hasOwn(b, 'bio')) {
    const raw = b.bio == null ? '' : b.bio;
    if (typeof raw !== 'string') return { ok: false, error: ERR_BIO_LENGTH };
    // Whitespace (newlines included) collapses before controls are stripped,
    // so a pasted line break becomes a space instead of gluing two words.
    const bio = raw.replace(/\s+/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (bio.length > BIO_MAX) return { ok: false, error: ERR_BIO_LENGTH };
    if (bio !== '' && LINKISH.test(bio)) return { ok: false, error: ERR_BIO_LINK };
    patch.bio = bio === '' ? null : bio;
  }

  if (Object.hasOwn(b, 'mounts')) {
    const list = b.mounts;
    if (!Array.isArray(list)) return { ok: false, error: ERR_MOUNTS_SHAPE };
    if (list.length > MOUNTS_MAX) return { ok: false, error: ERR_MOUNTS_MANY };
    const seen = new Set<string>();
    const mounts: { slug: string; name: string }[] = [];
    for (const item of list) {
      const text = cleanMount(item);
      if (text.length < 1) return { ok: false, error: ERR_MOUNT };
      const slug = canonicalSlug(slugify(text));
      const def = mountBySlug(slug);
      // A mount a published flight already names is offered by the picker in
      // the record's own spelling, which only the flight schema bounded (80
      // chars, any characters). It is accepted the way a catalogued name is
      // and stored under the record's name; the product-name rule below is
      // for free text.
      const flown = def ? undefined : ctx.record?.get(slug);
      if (!flown) {
        if (text.length > MOUNT_MAX || !MOUNT_RE.test(text)) return { ok: false, error: ERR_MOUNT };
        // A catalogued name is ours to show even when it reads like a domain
        // ("Claude.ai"); anything else that looks like a link is refused.
        if (!def && LINKISH.test(text)) return { ok: false, error: ERR_MOUNT };
      }
      if (seen.has(slug)) continue;
      seen.add(slug);
      mounts.push({ slug, name: def ? def.name : flown ? flown.name : text });
    }
    patch.mounts = mounts;
  }

  if (Object.hasOwn(b, 'githubPublic') && ctx.hasGithubLogin) {
    if (typeof b.githubPublic !== 'boolean') return { ok: false, error: ERR_GITHUB_SHAPE };
    patch.github_public = b.githubPublic ? 1 : 0;
  }

  return { ok: true, patch };
}
