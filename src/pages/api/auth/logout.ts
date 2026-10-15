import type { APIRoute } from 'astro';
import { SESSION_COOKIE, destroySession } from '../../../lib/session';

export const prerender = false;

// Plain form POST from /me — deletes the session row and clears the
// cookie. The middleware's origin check (and Astro's) guard it.
export const POST: APIRoute = async ({ locals, cookies, redirect }) => {
  const { env } = locals.runtime;
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (token && env.SESSION_PEPPER) {
    await destroySession(env.DB, env.SESSION_PEPPER, token);
  }
  cookies.delete(SESSION_COOKIE, { path: '/' });
  cookies.delete('ar_signedin', { path: '/' });
  return redirect('/', 303);
};
