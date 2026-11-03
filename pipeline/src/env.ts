// Environment access with named failures. Secrets come from the environment
// only (GitHub Actions secrets in CI, a local .env sourced by the shell in
// dev) — never from files in the repo.

export function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export function intEnv(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v === undefined ? fallback : Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${v}"`);
  return n;
}
