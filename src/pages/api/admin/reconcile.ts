import type { APIRoute } from 'astro';
import { reconcile } from '../../../lib/reconcile.ts';

export const prerender = false;

// Force an immediate mirror sync (bypasses the 60s throttle).
export const POST: APIRoute = async ({ locals, url }) => {
  const result = await reconcile(locals.runtime.env, url.origin, { force: true });
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
};
