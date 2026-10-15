import type { APIRoute } from 'astro';

export const prerender = false;

// Liveness + bindings check: D1 answers, the schema is migrated, KV
// round-trips. 200 when everything is green, 503 otherwise — the body
// says which check failed.
export const GET: APIRoute = async ({ locals }) => {
  const checks: Record<string, string> = {};

  try {
    const row = await locals.runtime.env.DB.prepare('SELECT 1 AS one').first<{ one: number }>();
    checks.d1 = row?.one === 1 ? 'ok' : 'unexpected result';
  } catch (error) {
    checks.d1 = `error: ${(error as Error).message}`;
  }

  try {
    const table = await locals.runtime.env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'riders'",
    ).first<{ name: string }>();
    checks.schema = table?.name === 'riders' ? 'ok' : 'migrations not applied';
  } catch (error) {
    checks.schema = `error: ${(error as Error).message}`;
  }

  try {
    await locals.runtime.env.RATE.put('health:ping', '1', { expirationTtl: 60 });
    const pong = await locals.runtime.env.RATE.get('health:ping');
    checks.kv = pong === '1' ? 'ok' : 'unexpected result';
  } catch (error) {
    checks.kv = `error: ${(error as Error).message}`;
  }

  const ok = Object.values(checks).every((value) => value === 'ok');
  return new Response(JSON.stringify({ ok, checks }, null, 2), {
    status: ok ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
  });
};
