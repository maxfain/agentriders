/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

type AgentRidersEnv = {
  DB: D1Database;
  RATE: KVNamespace;
};

type Runtime = import('@astrojs/cloudflare').Runtime<AgentRidersEnv>;

declare namespace App {
  interface Locals extends Runtime {}
}
