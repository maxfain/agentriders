// The Flight Log corpus client: typed PostgREST RPC calls against the
// Supabase Postgres database the pipeline maintains (docs/flight-log-corpus.md),
// plus the formatting helpers the corpus pages share. Plain fetch — no SDK —
// and erasable TypeScript so node --test can import it directly.

export type FlightlogEnv = { SUPABASE_URL?: string; SUPABASE_SERVICE_KEY?: string };

export function flightlogConfigured(env: FlightlogEnv): boolean {
  return !!env.SUPABASE_URL && !!env.SUPABASE_SERVICE_KEY;
}

/**
 * One RPC round trip. Returns null for "function returned SQL null" (page →
 * 404) and throws on transport/SQL errors (page → 500). fetchImpl is
 * injectable for tests.
 */
export async function rpc<T>(
  env: FlightlogEnv,
  fn: string,
  args: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<T | null> {
  if (!flightlogConfigured(env)) throw new Error('flight log database is not configured');
  const url = `${env.SUPABASE_URL!.replace(/\/$/, '')}/rest/v1/rpc/${fn}`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY!,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY!}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`rpc ${fn} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  const text = await res.text();
  if (text === '' || text === 'null') return null;
  return JSON.parse(text) as T;
}

// --- shared shapes (mirroring pipeline/migrations/0001_init.sql) -------------

export type FlightItem = {
  number: number;
  title: string;
  agent: string;
  state: 'open' | 'merged' | 'closed';
  outcome: string | null;
  opened_at: string | null;
  merged_at: string | null;
  additions: number | null;
  deletions: number | null;
  files_changed: number | null;
  hours_to_merge: number | null;
  index_ok: boolean;
  task_type: string | null;
  repo?: string;
};

export type FlightPage = {
  gone?: boolean;
  flight: FlightItem & {
    id: number;
    body_excerpt: string | null;
    body_chars: number | null;
    confidence: string;
    signals: string[];
    closed_at: string | null;
    commits: number | null;
    metrics_source: string | null;
    review_count: number | null;
    change_requests: number | null;
    review_comment_count: number | null;
    debrief: string | null;
    reviewer_excerpt: string | null;
    reviewer_excerpt_url: string | null;
    source: string;
    enriched_at: string | null;
    og_generated_at: string | null;
    updated_at: string;
  };
  repo: { full_name: string; owner: string; name: string; stars: number | null; primary_language: string | null; license: string | null };
  author: { login: string; avatar_url: string | null; github_user_id: number; is_bot: boolean };
  claim: { rider_handle: string; visibility: string; note: string | null; claimed_at: string } | null;
  events: { kind: string; actor_login: string | null; at: string | null; url: string | null }[];
  related: FlightItem[];
};

export type RepoPage = {
  gone?: boolean;
  repo: { full_name: string; owner: string; name: string; stars: number | null; primary_language: string | null; license: string | null; fetched_at: string | null };
  agents: { agent: string; flights: number; merged: number; merge_rate: number | null; burn_rate: number | null; median_hours_to_merge: number | null; last_flight_at: string | null }[];
  flights: FlightItem[];
  burns: { number: number; agent: string; reviewer_excerpt: string; reviewer_excerpt_url: string | null }[];
  monthly: { month: string; flights: number; merged: number; burns: number }[];
  total: number;
};

export type AgentPage = {
  agent: string;
  totals: { flights: number; merged: number; burns: number; repos: number; merge_rate: number | null; burn_rate: number | null; median_hours_to_merge: number | null };
  monthly: { month: string; flights: number; merge_rate: number | null; burn_rate: number | null }[];
  top_repos: { full_name: string; stars: number | null; flights: number; merge_rate: number | null }[];
  task_types: { type: string; flights: number }[];
  notable: FlightItem[];
};

export type RiderFlights = {
  total: number;
  public: number;
  flights: (FlightItem & { repo: string; visibility: 'public' | 'hidden'; note: string | null; claimed_at: string })[];
};

/**
 * The signed-in rider's proven GitHub account id — the identity row stamped
 * at OAuth. The one thing a claim may be checked against (no gist, no email,
 * no "I ran this" button).
 */
export async function githubIdentityOf(db: D1Database, riderId: string): Promise<number | null> {
  const row = await db
    .prepare("SELECT provider_id FROM identities WHERE rider_id = ? AND provider = 'github'")
    .bind(riderId)
    .first<{ provider_id: string }>();
  if (!row) return null;
  const id = Number(row.provider_id);
  return Number.isFinite(id) ? id : null;
}

// --- vocabulary ---------------------------------------------------------------

export const AGENT_SLUGS = ['openai-codex', 'github-copilot', 'devin', 'cursor', 'claude-code'] as const;

export const AGENT_LABELS: Record<string, string> = {
  'openai-codex': 'OpenAI Codex',
  'github-copilot': 'GitHub Copilot',
  devin: 'Devin',
  cursor: 'Cursor',
  'claude-code': 'Claude Code',
  unknown: 'Unknown agent',
};

export function isAgentSlug(value: string): boolean {
  return (AGENT_SLUGS as readonly string[]).includes(value);
}

export const OUTCOME_LABELS: Record<string, string> = {
  merged_clean: 'Merged clean',
  merged_after_rework: 'Merged after rework',
  burn: 'Burn',
  abandoned: 'Abandoned',
  open: 'Open',
  stale: 'Stale',
};

/** Outcome → the brand color class the pages use (ok / warn / burn / quiet). */
export function outcomeTone(outcome: string | null): 'ok' | 'warn' | 'burn' | 'quiet' {
  switch (outcome) {
    case 'merged_clean': return 'ok';
    case 'merged_after_rework': return 'warn';
    case 'burn': return 'burn';
    default: return 'quiet';
  }
}

export const CONFIDENCE_LABELS: Record<string, string> = {
  dataset: 'AIDev dataset',
  high: 'high (two or more signals)',
  medium: 'medium (one agent-written signal)',
  low: 'low (branch prefix only)',
};

// --- formatting ----------------------------------------------------------------

/** owner/name path segments must look like GitHub names before touching the DB. */
export function validOwner(s: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(s);
}

export function validRepoName(s: string): boolean {
  return /^[A-Za-z0-9._-]{1,100}$/.test(s) && s !== '.' && s !== '..';
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function fmtHours(hours: number | string | null | undefined): string {
  if (hours === null || hours === undefined) return '—';
  const h = Number(hours);
  if (!Number.isFinite(h)) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h * 10) / 10} h`;
  return `${Math.round((h / 24) * 10) / 10} d`;
}

export function fmtRate(rate: number | string | null | undefined): string {
  if (rate === null || rate === undefined) return '—';
  const r = Number(rate);
  return Number.isFinite(r) ? `${Math.round(r * 100)}%` : '—';
}

export function fmtInt(n: number | string | null | undefined): string {
  if (n === null || n === undefined) return '—';
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString('en-US') : '—';
}

/** The flight page's title pattern from the brief. */
export function flightTitle(prTitle: string, agent: string, repoFullName: string): string {
  return `${prTitle} — ${AGENT_LABELS[agent] ?? agent} flight in ${repoFullName}`;
}
