// The Flight Log corpus client: typed PostgREST RPC calls against the
// Supabase Postgres database the pipeline maintains (docs/flight-log-corpus.md),
// plus the formatting helpers the corpus pages share. Plain fetch — no SDK —
// and erasable TypeScript so node --test can import it directly.

import { clampAtSentence, clampDescription, clampTitle } from './seo.ts';

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

// --- vendors and attribution prose ---------------------------------------------

/** Who makes each agent — for titles, answer paragraphs, anchors and JSON-LD. */
export type AgentVendor = {
  vendor: string;
  vendorUrl: string;
  product: string;
  /** The product's own page: the one outbound link a corpus page makes to the maker. */
  url: string;
  /** Search synonyms (JSON-LD keywords). */
  aliases: string[];
};

export const AGENT_VENDORS: Record<string, AgentVendor> = {
  'claude-code': {
    vendor: 'Anthropic', vendorUrl: 'https://www.anthropic.com/', product: 'Claude Code',
    url: 'https://www.anthropic.com/claude-code', aliases: ['Claude', 'Anthropic Claude Code', 'Claude Code CLI'],
  },
  'openai-codex': {
    vendor: 'OpenAI', vendorUrl: 'https://openai.com/', product: 'OpenAI Codex',
    url: 'https://openai.com/codex/', aliases: ['Codex', 'Codex CLI', 'GPT'],
  },
  'github-copilot': {
    vendor: 'GitHub', vendorUrl: 'https://github.com/', product: 'GitHub Copilot',
    url: 'https://github.com/features/copilot', aliases: ['Copilot coding agent', 'Microsoft'],
  },
  cursor: {
    vendor: 'Anysphere', vendorUrl: 'https://anysphere.inc/', product: 'Cursor',
    url: 'https://cursor.com/', aliases: ['Cursor Agent'],
  },
  devin: {
    vendor: 'Cognition', vendorUrl: 'https://cognition.ai/', product: 'Devin',
    url: 'https://devin.ai/', aliases: ['Cognition AI'],
  },
};

/** How a flight is attributed to each agent (pipeline/src/agents.ts), as prose for the agent page. */
export const AGENT_SIGNALS_PROSE: Record<string, string> = {
  'claude-code': 'A flight is attributed to Claude Code by the “Co-authored-by: Claude” trailer it writes into commits, by the claude[bot] author of its GitHub Action, and by claude/ branch names.',
  'openai-codex': 'Codex writes no attribution of its own: flights come from the AIDev dataset’s identification and from codex/ branch names, and a branch prefix alone keeps a flight out of the index until a second signal or the author’s claim confirms it.',
  'github-copilot': 'A flight is attributed to GitHub Copilot by the Copilot and copilot-swe-agent[bot] authors, the copilot-swe-agent co-author line, and copilot/ branch names.',
  cursor: 'A flight is attributed to Cursor by the “Co-authored-by: Cursor Agent” commit line and by cursor/ branch names.',
  devin: 'A flight is attributed to Devin by its devin-ai-integration[bot] author — the signature the AIDev paper confirmed.',
};

export function agentVendor(slug: string): AgentVendor {
  return AGENT_VENDORS[slug] ?? { vendor: '', vendorUrl: '', product: AGENT_LABELS[slug] ?? slug, url: '', aliases: [] };
}

/** "Claude Code (Anthropic)"; the product alone when the maker is unknown. */
export function agentWithVendor(slug: string): string {
  const v = agentVendor(slug);
  return v.vendor ? `${v.product} (${v.vendor})` : v.product;
}

// --- authors ---------------------------------------------------------------------

export type AuthorRef = { login: string; name?: string | null; is_bot?: boolean };

// A GitHub display name is free text. Control characters go, whitespace
// collapses, anything past 40 code points is dropped, and an empty result — or
// one that only repeats the login — falls back to the login, so no page ever
// reads "octocat (@octocat)".
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;

export function authorDisplay(a: AuthorRef): string {
  const cleaned = (a.name ?? '').replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  const name = Array.from(cleaned).slice(0, 40).join('').trim();
  if (!name || name.toLowerCase() === a.login.toLowerCase()) return a.login;
  return name;
}

/** "Jane Doe (@janedoe)", or "@janedoe" when no distinct name is known. */
export function authorLabel(a: AuthorRef): string {
  const name = authorDisplay(a);
  return name === a.login ? `@${a.login}` : `${name} (@${a.login})`;
}

// --- titles, headings, answers ----------------------------------------------------
// Pure strings from stored fields. Every page's <title>, H1 suffix, answer
// paragraph and description come from here, so a change to the pattern is one
// edit and one test.

const OUTCOME_PHRASES: Record<string, string> = {
  merged_clean: 'merged clean',
  merged_after_rework: 'merged after rework',
  burn: 'a burn — closed unmerged after human review',
  abandoned: 'abandoned — closed unmerged with no human engagement',
  open: 'still open',
  stale: 'open and stale',
};

const cpLen = (s: string) => Array.from(s).length;

/**
 * Flight <title>: `{PR title} — {Product} ({Vendor}) pull request by {Name} in {owner/repo}`.
 * Only the PR title is clamped (40 code points); the repo goes last so an
 * overflow drops it, never the agent, the vendor or the name. No "#n" — it
 * lives in the eyebrow, and nobody searches for it.
 */
export function flightTitle(f: { prTitle: string; agent: string; repoFullName: string; author: AuthorRef; max?: number }): string {
  const max = f.max ?? 90;
  const pr = clampTitle(f.prTitle, 40);
  const tail = f.author.is_bot
    ? ` — ${agentWithVendor(f.agent)} bot pull request`
    : ` — ${agentWithVendor(f.agent)} pull request by ${authorDisplay(f.author)}`;
  const full = `${pr}${tail} in ${f.repoFullName}`;
  return cpLen(full) <= max ? full : clampTitle(`${pr}${tail}`, max);
}

/** Inside the H1, after the PR title. */
export function flightH1Suffix(agent: string, author: AuthorRef): string {
  return author.is_bot
    ? `— a ${agentWithVendor(agent)} bot flight`
    : `— a ${agentWithVendor(agent)} flight by ${authorDisplay(author)}`;
}

export type FlightFacts = {
  author: AuthorRef;
  agent: string;
  repoFullName: string;
  openedAt: string | null;
  state: string;
  outcome: string | null;
  hoursToMerge: number | string | null;
  additions: number | null;
  deletions: number | null;
  filesChanged: number | null;
  reviewCount: number | null;
  /** Login of whoever merged a bot-authored flight (the human in the loop). */
  mergedBy?: string | null;
};

/** The answer paragraph under the H1: who, which agent, where, when, how it ended, the numbers. */
export function flightAnswer(f: FlightFacts): string {
  const v = agentVendor(f.agent);
  const opened = f.author.is_bot
    ? `The ${v.product} bot${v.vendor ? ` (${v.vendor})` : ''} opened this pull request`
    : `${authorLabel(f.author)} opened this ${agentWithVendor(f.agent)} pull request`;
  const when = f.openedAt ? ` on ${fmtDate(f.openedAt)}` : '';
  let ending = f.outcome ? (OUTCOME_PHRASES[f.outcome] ?? f.outcome.replace(/_/g, ' ')) : f.state;
  if (f.state === 'merged' && f.hoursToMerge !== null && f.hoursToMerge !== undefined) ending += ` in ${fmtHours(f.hoursToMerge)}`;
  if (f.state === 'merged' && f.mergedBy) ending += `, merged by @${f.mergedBy}`;
  const numbers: string[] = [];
  if (f.additions !== null && f.deletions !== null) numbers.push(`+${fmtInt(f.additions)} −${fmtInt(f.deletions)}`);
  if (f.filesChanged !== null) numbers.push(`${fmtInt(f.filesChanged)} ${Number(f.filesChanged) === 1 ? 'file' : 'files'}`);
  if (f.reviewCount !== null) numbers.push(`${fmtInt(f.reviewCount)} ${Number(f.reviewCount) === 1 ? 'review' : 'reviews'}`);
  return `${opened} in ${f.repoFullName}${when}; ${ending}${numbers.length > 0 ? `: ${numbers.join(', ')}` : ''}.`;
}

/**
 * Meta description: whose, which agent and maker, where — then the debrief,
 * the one unique prose per flight, cut at a sentence boundary. Without a
 * debrief (the flight is unindexed anyway) the answer sentence stands in.
 */
export function flightDescription(f: { author: AuthorRef; agent: string; repoFullName: string; debrief: string | null; answer: string }): string {
  if (!f.debrief) return clampDescription(f.answer);
  const prefix = f.author.is_bot
    ? `${agentWithVendor(f.agent)} bot PR in ${f.repoFullName}: `
    : `${authorDisplay(f.author)}’s ${agentWithVendor(f.agent)} PR in ${f.repoFullName}: `;
  const room = 155 - cpLen(prefix);
  if (room < 40) return clampDescription(`${prefix}${f.debrief}`);
  return `${prefix}${clampAtSentence(f.debrief, room)}`;
}

export type RepoAgentStat = { agent: string; flights: number; merge_rate: number | string | null };

const byFlights = (a: RepoAgentStat, b: RepoAgentStat) => Number(b.flights) - Number(a.flights);

/** Repo <title>: `{owner/repo}: {N} AI coding-agent pull requests — {Product (Vendor)}, …`; makers drop from the end until it fits. */
export function repoTitle(r: { fullName: string; total: number; agents: RepoAgentStat[]; max?: number }): string {
  const max = r.max ?? 90;
  const head = `${r.fullName}: ${fmtInt(r.total)} AI coding-agent pull ${Number(r.total) === 1 ? 'request' : 'requests'}`;
  const products = [...r.agents].sort(byFlights).map((a) => agentWithVendor(a.agent));
  for (let k = Math.min(3, products.length); k >= 1; k--) {
    const t = `${head} — ${products.slice(0, k).join(', ')}`;
    if (cpLen(t) <= max) return t;
  }
  return clampTitle(head, max);
}

export const repoH1Suffix = '— agent flight log';

export function repoAnswer(r: { fullName: string; total: number; stars: number | null; language: string | null; agents: RepoAgentStat[] }): string {
  const meta = [r.stars !== null ? `★ ${fmtInt(r.stars)}` : null, r.language].filter(Boolean).join(', ');
  const agents = [...r.agents].sort(byFlights).map((a) =>
    `${agentWithVendor(a.agent)} ${fmtInt(a.flights)}${a.merge_rate !== null && a.merge_rate !== undefined ? ` (${fmtRate(a.merge_rate)} merged)` : ''}`);
  return `${fmtInt(r.total)} pull ${Number(r.total) === 1 ? 'request' : 'requests'} opened by AI coding agents in ${r.fullName}` +
    `${meta ? ` (${meta})` : ''}${agents.length > 0 ? `: ${agents.join(', ')}` : ''}.`;
}

export type AgentTotals = {
  flights: number;
  repos: number;
  merge_rate: number | string | null;
  burn_rate: number | string | null;
  median_hours_to_merge: number | string | null;
};

export function agentTitle(slug: string, t: AgentTotals, max = 90): string {
  return clampTitle(
    `${agentWithVendor(slug)} pull requests on GitHub: ${fmtInt(t.flights)} flights, ${fmtRate(t.merge_rate)} merged, ${fmtRate(t.burn_rate)} burned`,
    max,
  );
}

export function agentH1Suffix(slug: string): string {
  const v = agentVendor(slug);
  return v.vendor ? `— ${v.vendor}’s coding agent, on the record` : '— on the record';
}

export function agentAnswer(slug: string, t: AgentTotals): string {
  const median = t.median_hours_to_merge !== null && t.median_hours_to_merge !== undefined
    ? `, median ${fmtHours(t.median_hours_to_merge)} to merge` : '';
  return `${agentWithVendor(slug)} has opened ${fmtInt(t.flights)} public pull ${Number(t.flights) === 1 ? 'request' : 'requests'} ` +
    `across ${fmtInt(t.repos)} GitHub ${Number(t.repos) === 1 ? 'repository' : 'repositories'} in this corpus: ` +
    `${fmtRate(t.merge_rate)} merged, ${fmtRate(t.burn_rate)} burned (closed unmerged after human review)${median}.`;
}
