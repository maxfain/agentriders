import { defineMiddleware } from 'astro:middleware';
import { SESSION_COOKIE, resolveSession } from './lib/session';
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

  // The admin surface doesn't exist for anyone else — 404, not 403, so its
  // shape isn't even confirmed. Covers /admin pages and /api/admin routes.
  const path = context.url.pathname;
  if ((path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/admin')) && !isAdmin(context.locals.rider)) {
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  }

  const response = await next();
  response.headers.set('Cache-Control', 'no-store');
  return response;
});
