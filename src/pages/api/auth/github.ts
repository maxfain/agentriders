import type { APIRoute } from 'astro';
import { randomToken } from '../../../lib/crypto';

export const prerender = false;

export const OAUTH_STATE_COOKIE = 'ar_oauth_state';

// Kick off GitHub OAuth: random state in a short-lived cookie, then off to
// the authorize screen. The callback route checks the state round-trip.
export const GET: APIRoute = async ({ locals, url, cookies, redirect }) => {
  const { env } = locals.runtime;
  if (!env.GITHUB_OAUTH_CLIENT_ID) {
    return new Response(JSON.stringify({ error: 'GitHub sign-in is not configured yet.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const state = randomToken(16);
  cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: url.protocol === 'https:',
    path: '/',
    maxAge: 600,
  });

  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', env.GITHUB_OAUTH_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', `${url.origin}/api/auth/github/callback`);
  authorize.searchParams.set('scope', 'user:email');
  authorize.searchParams.set('state', state);
  return redirect(authorize.toString(), 302);
};
