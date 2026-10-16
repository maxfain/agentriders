import { defineMiddleware } from 'astro:middleware';
import { SESSION_COOKIE, resolveSession } from './lib/session';
import { resolveDeviceAuth } from './lib/device-auth';
import { isAdmin } from './lib/admin';

// Mirrors the `/*` block in public/_headers, which Pages applies to static
// assets only — dynamic responses (sign-in, /me, admin) need them set here.
const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000',
};

// Device-signature auth is honored only on the routes an agent (CLI / MCP)
// legitimately needs — never the whole API. Human-intent writes (vouches,
// handle claim, device management) stay cookie-only, so a device key can't
// silently cast a vouch, squat a handle, or enroll more devices.
function deviceAuthAllowed(path: string, method: string): boolean {
  if (method === 'GET') return path === '/api/me';
  if (method === 'POST') {
    return path === '/api/submissions' || /^\/api\/submissions\/[^/]+\/submit$/.test(path);
  }
  return false;
}

// Private surfaces: never cached, never indexed. /me, /join and /logs/new are
// per-rider. /admin must never be cached at all: a shared cache would hand
// the review queue, a rider's email or a submission body to the next
// visitor, and its 404-for-everyone-else shape (below) only holds while no
// cache ever stores a real response for the path.
function isPrivatePath(path: string): boolean {
  return (
    path === '/admin' || path.startsWith('/admin/') ||
    path === '/me' || path.startsWith('/me/') ||
    path === '/join' || path === '/join/' ||
    path === '/logs/new' || path === '/logs/new/'
  );
}

// Page URLs carry a trailing slash: canonicals, the sitemap and internal
// links all agree on that form, and Cloudflare already 308s static pages
// to it. Astro's own `trailingSlash: 'always'` can't do this for the
// on-demand pages, because it also redirects extension-less endpoints
// (/api/me, /api/submissions) and the CLI/MCP sign the exact path they
// call (device-auth.ts) — a redirect would break every signed request.
// So: pages only. GET/HEAD, no file extension, not /api/, not Astro's /_
// internals; the query string travels with the redirect. A mixed-case
// profile path is lowercased in the same hop, so /riders/MaxCR costs one
// 301, not a chain through /riders/MaxCR/ (riders/[handle].astro covers the
// already-slashed form). context.url is Astro's normalized URL — the decoded
// pathname re-serialized by the URL parser, which drops CR/LF and re-encodes
// anything unsafe — so the Location header never carries a raw control
// character; the page then 404s any decoded param that is not a handle shape.
function slashedPath(url: URL): string | null {
  const { pathname } = url;
  if (pathname.endsWith('/') || pathname.startsWith('/api/') || pathname.startsWith('/_')) return null;
  if (/\.[a-z0-9]+$/i.test(pathname)) return null;
  const handle = pathname.match(/^\/riders\/([^/]+)$/)?.[1];
  if (handle && handle !== handle.toLowerCase()) return `/riders/${handle.toLowerCase()}/${url.search}`;
  return `${pathname}/${url.search}`;
}

// Runs for server routes (prerender = false) at request time, and once at
// build time for prerendered pages — where it passes straight through so
// the static output is untouched. The adapter populates locals.runtime
// even during prerender (with process.env), so the build-time guard is
// isPrerendered, not runtime truthiness.
//
// Request-time duties: trailing-slash redirect for pages, cross-origin
// write rejection (Astro's built-in checkOrigin fires as well — two layers
// on purpose), session-cookie → locals.rider resolution, and the caching
// rule on every dynamic response.
export const onRequest = defineMiddleware(async (context, next) => {
  if (context.isPrerendered || !context.locals.runtime) return next();

  const method = context.request.method;
  if (method === 'GET' || method === 'HEAD') {
    const slashed = slashedPath(context.url);
    if (slashed) return context.redirect(slashed, 301);
  }

  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const origin = context.request.headers.get('Origin');
    const hasSessionCookie = !!context.cookies.get(SESSION_COOKIE)?.value;
    // A mismatched Origin is always rejected. A *missing* Origin is allowed
    // only for the cookieless CLI endpoints (devices/link, flight-records),
    // which authenticate by link code or signature — a cookie-authenticated
    // write must carry a matching Origin, which browsers always send, so the
    // Origin layer backstops SameSite=Lax instead of failing open.
    if ((origin && origin !== context.url.origin) || (!origin && hasSessionCookie)) {
      return new Response(JSON.stringify({ error: 'cross-origin request rejected' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  context.locals.rider = null;
  context.locals.sessionId = null;
  const { env } = context.locals.runtime;
  const token = context.cookies.get(SESSION_COOKIE)?.value;
  if (token && env.SESSION_PEPPER) {
    try {
      const resolved = await resolveSession(env.DB, env.SESSION_PEPPER, token);
      if (resolved) {
        context.locals.rider = resolved.rider;
        context.locals.sessionId = resolved.sessionId;
      } else {
        context.cookies.delete(SESSION_COOKIE, { path: '/' });
      }
    } catch {
      // A session lookup failure must never take down a public page;
      // the request just proceeds signed out.
    }
  }

  // Device-signature auth (CLI / MCP) as a fallback when there is no cookie
  // session, and only on the allowlisted routes. sessionId stays null — the
  // admin gate below uses that to keep a device identity out of /admin even if
  // the device belongs to an admin.
  if (!context.locals.rider && deviceAuthAllowed(context.url.pathname, method)) {
    try {
      const viaDevice = await resolveDeviceAuth(env, context.request, context.url);
      if (viaDevice) context.locals.rider = viaDevice;
    } catch {
      // Device auth never breaks the request path.
    }
  }

  // The admin surface doesn't exist for anyone else — 404, not 403, so its
  // shape isn't even confirmed. Covers /admin pages and /api/admin routes.
  // A cookie session is required: device auth (sessionId === null) never
  // reaches admin.
  const path = context.url.pathname;
  const adminPath = path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/admin');
  if (adminPath && (!isAdmin(context.locals.rider) || !context.locals.sessionId)) {
    // A 404 with no body makes Astro serve the prerendered /404 page (the
    // branded one) under this status; a body here would pin plain text.
    // (Astro.rewrite('/404') is not an option: rewriting an on-demand route
    // to a prerendered page throws.) The headers travel with the page.
    return new Response(null, {
      status: 404,
      headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' },
    });
  }

  const response = await next();

  // Caching rule. no-store whenever the response could be personal: a
  // signed-in rider, a write, a non-public API route, or a private surface.
  // Otherwise the route's own Cache-Control stands (site-state.json sets
  // one), and a successful anonymous GET of a public dynamic page — a
  // profile, the directory — becomes briefly cacheable; errors never are,
  // so a transient 5xx can't sit at the edge for five minutes. `Vary:
  // Cookie` keeps a shared cache from ever answering a signed-in request
  // with that anonymous copy.
  const privateApi = path.startsWith('/api/') && !path.startsWith('/api/public/');
  const personal = !!context.locals.rider || (method !== 'GET' && method !== 'HEAD');
  if (personal || privateApi || isPrivatePath(path)) {
    response.headers.set('Cache-Control', 'no-store');
  } else if (response.ok && !response.headers.has('Cache-Control')) {
    response.headers.set('Cache-Control', 'public, max-age=60, s-maxage=300');
    response.headers.append('Vary', 'Cookie');
  }
  // public/_headers carries the same rule for static assets; Pages Functions
  // responses need it set here.
  if (isPrivatePath(path)) response.headers.set('X-Robots-Tag', 'noindex');
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
  return response;
});
