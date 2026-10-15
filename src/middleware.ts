import { defineMiddleware } from 'astro:middleware';

// Runs for server routes (prerender = false) at request time, and for
// prerendered pages once at build time — where there is no runtime, so we
// pass straight through and the static output is untouched.
//
// M0 skeleton: cross-origin write rejection + no-store on dynamic responses.
// Session resolution (locals.rider) lands in M1.
export const onRequest = defineMiddleware(async (context, next) => {
  if (!context.locals.runtime) return next();

  const method = context.request.method;
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const origin = context.request.headers.get('Origin');
    if (origin && origin !== context.url.origin) {
      return new Response(JSON.stringify({ error: 'cross-origin request rejected' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const response = await next();
  response.headers.set('Cache-Control', 'no-store');
  return response;
});
