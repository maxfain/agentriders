import type { APIRoute } from 'astro';
import { findOrCreateRider, completeSignIn } from '../../../../lib/auth';
import { OAUTH_STATE_COOKIE } from '../github';

export const prerender = false;

type GitHubUser = { id: number; login: string; name: string | null; email: string | null };
type GitHubEmail = { email: string; primary: boolean; verified: boolean };

const GITHUB_HEADERS = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'agentriders.com',
};

export const GET: APIRoute = async (context) => {
  const { locals, url, cookies, redirect } = context;
  const { env } = locals.runtime;

  const expectedState = cookies.get(OAUTH_STATE_COOKIE)?.value;
  cookies.delete(OAUTH_STATE_COOKIE, { path: '/' });

  if (url.searchParams.get('error')) return redirect('/join/?error=oauth_denied', 302);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirect('/join/?error=oauth_state', 302);
  }
  if (!env.GITHUB_OAUTH_CLIENT_ID || !env.GITHUB_OAUTH_CLIENT_SECRET || !env.SESSION_PEPPER) {
    return redirect('/join/?error=oauth_failed', 302);
  }

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: env.GITHUB_OAUTH_CLIENT_ID,
        client_secret: env.GITHUB_OAUTH_CLIENT_SECRET,
        code,
        redirect_uri: `${url.origin}/api/auth/github/callback`,
      }),
    });
    const tokenBody = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenResponse.ok || !tokenBody.access_token) {
      return redirect('/join/?error=oauth_failed', 302);
    }
    const authed = { ...GITHUB_HEADERS, Authorization: `Bearer ${tokenBody.access_token}` };

    const userResponse = await fetch('https://api.github.com/user', { headers: authed });
    if (!userResponse.ok) return redirect('/join/?error=oauth_failed', 302);
    const user = (await userResponse.json()) as GitHubUser;

    // Primary verified email, when the scope grants it; sign-in works
    // without one (the identity is keyed on the GitHub account id).
    let email = user.email;
    const emailsResponse = await fetch('https://api.github.com/user/emails', { headers: authed });
    if (emailsResponse.ok) {
      const emails = (await emailsResponse.json()) as GitHubEmail[];
      email = emails.find((e) => e.primary && e.verified)?.email ?? email;
    }

    const rider = await findOrCreateRider(env.DB, 'github', String(user.id), {
      email: email?.toLowerCase() ?? null,
      displayName: user.name || user.login,
    });

    // Stamp the login the profile may show (opt-out, 180-day window) — the
    // one identity we display because OAuth proved it. Re-stamped on every
    // GitHub sign-in so the freshness clock restarts. Its own try/catch: the
    // columns arrive with migration 0002, and a sign-in has to complete on a
    // database that doesn't have them yet; auth.ts stays as it is.
    try {
      await env.DB.prepare('UPDATE riders SET github_login = ?, github_login_at = ? WHERE id = ?')
        .bind(user.login, new Date().toISOString(), rider.id)
        .run();
    } catch {
      /* pre-0002: no login to show until the migration lands */
    }

    const dest = await completeSignIn(context, env.DB, env.SESSION_PEPPER, rider);
    return redirect(dest, 302);
  } catch {
    return redirect('/join/?error=oauth_failed', 302);
  }
};
