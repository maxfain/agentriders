import type { APIRoute } from 'astro';
import { isPendingHandle } from '../../lib/handles';

export const prerender = false;

// Who am I — powers the static header's "Join the Guild" → "@handle"
// swap, the only JavaScript the static pages need.
export const GET: APIRoute = async ({ locals }) => {
  const rider = locals.rider;
  const body = rider
    ? {
        authenticated: true,
        handle: rider.handle,
        displayName: rider.display_name,
        pending: isPendingHandle(rider.handle),
        rank: rider.rank,
      }
    : { authenticated: false };
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  });
};
