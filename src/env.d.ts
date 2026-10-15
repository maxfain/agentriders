/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

type AgentRidersEnv = {
  DB: D1Database;
  RATE: KVNamespace;
  // Secrets (wrangler pages secret put / dashboard; .dev.vars locally).
  SESSION_PEPPER?: string;
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  // Local dev only: "1" echoes the magic link in the API response
  // instead of requiring Resend. Never set in production.
  DEV_MAGIC_ECHO?: string;
};

type Runtime = import('@astrojs/cloudflare').Runtime<AgentRidersEnv>;

declare namespace App {
  interface Locals extends Runtime {
    /** Signed-in rider for this request, resolved by the middleware. */
    rider: import('./lib/session').RiderRow | null;
    /** Hashed id of the current session row, when signed in. */
    sessionId: string | null;
  }
}
