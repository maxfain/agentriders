import { defineMiddleware } from 'astro:middleware';
import { SESSION_COOKIE, resolveSession } from './lib/session';
import { resolveDeviceAuth } from './lib/device-auth';
import { isAdmin } from './lib/admin';

// Runs for server routes (prerender = false) at request time, and once at
// build time for prerendered pages — where it passes straight through so
// the static output is untouched. The adapter populates locals.runtime
// even during prerender (with process.env), so the build-time guard is
// isPrerendered, not runtime truthiness.
//
// Request-time duties: cross-origin write rejection (Astro's built-in
// checkOrigin fires as well — two layers on purpose), session-cookie →
// locals.rider resolution, and no-store on every dynamic response.
export const onRequest = defineMiddleware(async (context, next) => {
  if (context.isPrerendered || !context.locals.runtime) return next();

  const method = context.request.method;
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
  // session. sessionId stays null — the admin gate below uses that to keep a
  // device identity out of /admin even if the device belongs to an admin.
  if (!context.locals.rider) {
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
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  }

  const response = await next();
  response.headers.set('Cache-Control', 'no-store');
  return response;
});
