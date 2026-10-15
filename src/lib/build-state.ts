// Build-time fetch of the live /api/public/site-state.json so static log
// pages can link `rider` to a real profile and show a Verified badge. The
// endpoint is dynamic (D1-backed); the build reads the currently-deployed
// one. Freshness self-corrects: every publish triggers a rebuild. A failure
// here must NEVER break a deploy, so everything falls back to empty.

export type SiteState = {
  handles: Set<string>;
  verified: Record<string, true>;
};

const EMPTY: SiteState = { handles: new Set(), verified: {} };

function originFor(): string {
  // This only runs at build time (getStaticPaths), i.e. in Node — so the
  // test/override origin comes from process.env (Vite doesn't surface
  // unprefixed vars on import.meta.env). Canonical site otherwise. Written
  // to be safe both under Vite and under plain `node --test`.
  const override =
    typeof process !== 'undefined' ? process.env?.SITE_STATE_ORIGIN : undefined;
  const site = (import.meta as { env?: Record<string, string | undefined> }).env?.SITE;
  return override || site || 'https://agentriders.com';
}

export async function fetchSiteState(): Promise<SiteState> {
  try {
    const target = new URL('/api/public/site-state.json', originFor()).href;
    const res = await fetch(target, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return EMPTY;
    const data = (await res.json()) as { handles?: string[]; verified?: Record<string, true> };
    return {
      handles: new Set(Array.isArray(data.handles) ? data.handles : []),
      verified: data.verified ?? {},
    };
  } catch {
    return EMPTY;
  }
}

/**
 * Decide how to render a log's `rider`. Returns a profile href only when the
 * rider string is a real claimed handle; otherwise the name renders as plain
 * text (legacy logs with "handle"/"example" never link).
 */
export function riderLink(rider: string, state: SiteState): string | null {
  return state.handles.has(rider) ? `/riders/${rider}` : null;
}

export function isVerified(slug: string, state: SiteState): boolean {
  return state.verified[slug] === true;
}
