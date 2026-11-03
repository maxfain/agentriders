// Agent identification. Every matched signal is stored on the flight
// (signals[]), never just the label, so a page can always say *why* a PR is
// attributed to an agent — and so the "verify" signatures from the brief can
// be audited against live PRs before they are trusted.
//
// Confidence ladder (brief, Pipeline step 5):
//   high   — two or more signals
//   medium — exactly one signal that is a bot author or a commit trailer /
//            co-author line (attribution the agent itself writes)
//   low    — a branch prefix alone (a human can name a branch anything)
//   dataset— rows taken from AIDev on the paper's identification, before any
//            re-verification of our own.

export const AGENT_SLUGS = [
  'openai-codex',
  'github-copilot',
  'devin',
  'cursor',
  'claude-code',
] as const;

export type AgentSlug = (typeof AGENT_SLUGS)[number] | 'unknown';

export const AGENT_LABELS: Record<string, string> = {
  'openai-codex': 'OpenAI Codex',
  'github-copilot': 'GitHub Copilot',
  devin: 'Devin',
  cursor: 'Cursor',
  'claude-code': 'Claude Code',
  unknown: 'Unknown agent',
};

/** AIDev's agent column values → our slugs. */
const AIDEV_AGENTS: Record<string, AgentSlug> = {
  OpenAI_Codex: 'openai-codex',
  Copilot: 'github-copilot',
  Devin: 'devin',
  Cursor: 'cursor',
  Claude_Code: 'claude-code',
};

export function aidevAgentToSlug(value: string): AgentSlug {
  return AIDEV_AGENTS[value] ?? 'unknown';
}

export type SignalInput = {
  authorLogin?: string | null;
  headRef?: string | null;
  /** Commit messages (trailers live here). */
  commitMessages?: string[];
  /** Co-author names/logins parsed from commits, lowercased. */
  coAuthors?: string[];
};

export type Detection = {
  agent: AgentSlug;
  signals: string[];
  confidence: 'high' | 'medium' | 'low';
};

const BOT_AUTHORS: Record<string, AgentSlug> = {
  'devin-ai-integration[bot]': 'devin', // confirmed by the AIDev paper
  copilot: 'github-copilot', // login "Copilot" — verify against live PRs
  'copilot-swe-agent[bot]': 'github-copilot',
  'claude[bot]': 'claude-code', // the GitHub Action author
};

const BRANCH_PREFIXES: Record<string, AgentSlug> = {
  'copilot/': 'github-copilot', // confirmed by the AIDev paper
  'claude/': 'claude-code',
  'cursor/': 'cursor', // verify
  'codex/': 'openai-codex', // heuristic only — Codex adds no attribution
};

const CLAUDE_TRAILER = /co-authored-by:\s*claude\s*<noreply@anthropic\.com>/i;
const CURSOR_COAUTHOR = /co-authored-by:\s*cursor\s*agent/i;
const COPILOT_COAUTHOR = /co-authored-by:[^\n<]*copilot-swe-agent\[bot\]/i;

/** A signal counts as "strong" when the agent wrote it itself. */
const STRONG_PREFIX = /^(author:|trailer:|coauthor:)/;

export function detectSignals(input: SignalInput): Detection | null {
  const signals: string[] = [];
  const votes = new Map<AgentSlug, number>();
  const vote = (agent: AgentSlug, signal: string) => {
    signals.push(signal);
    votes.set(agent, (votes.get(agent) ?? 0) + 1);
  };

  const login = (input.authorLogin ?? '').toLowerCase();
  if (login && BOT_AUTHORS[login]) vote(BOT_AUTHORS[login], `author:${login}`);

  const ref = input.headRef ?? '';
  for (const [prefix, agent] of Object.entries(BRANCH_PREFIXES)) {
    if (ref.toLowerCase().startsWith(prefix)) vote(agent, `branch:${prefix}`);
  }

  const messages = input.commitMessages ?? [];
  let sawClaudeTrailer = false;
  let sawCursor = false;
  let sawCopilot = false;
  for (const message of messages) {
    if (!sawClaudeTrailer && CLAUDE_TRAILER.test(message)) {
      sawClaudeTrailer = true;
      vote('claude-code', 'trailer:claude');
    }
    if (!sawCursor && CURSOR_COAUTHOR.test(message)) {
      sawCursor = true;
      vote('cursor', 'coauthor:cursor-agent');
    }
    if (!sawCopilot && COPILOT_COAUTHOR.test(message)) {
      sawCopilot = true;
      vote('github-copilot', 'coauthor:copilot-swe-agent[bot]');
    }
  }
  for (const co of input.coAuthors ?? []) {
    if (co.includes('cursor') && !sawCursor) {
      sawCursor = true;
      vote('cursor', 'coauthor:cursor-agent');
    }
  }

  if (signals.length === 0) return null; // a PR with no signal is not a flight

  // The agent with the most signals wins; ties go to the stronger signal set.
  let best: AgentSlug = 'unknown';
  let bestScore = -1;
  for (const [agent, n] of votes) {
    const strong = signals.filter(
      (s) => STRONG_PREFIX.test(s) && signalAgent(s) === agent,
    ).length;
    const score = n * 10 + strong;
    if (score > bestScore) {
      best = agent;
      bestScore = score;
    }
  }

  const agentSignals = signals.filter((s) => signalAgent(s) === best);
  const strongCount = agentSignals.filter((s) => STRONG_PREFIX.test(s)).length;
  const confidence: Detection['confidence'] =
    agentSignals.length >= 2 ? 'high' : strongCount >= 1 ? 'medium' : 'low';
  return { agent: best, signals, confidence };
}

/** Signals present in a single commit message (trailers / co-author lines). */
export function signalsFromCommitMessage(message: string): string[] {
  const out: string[] = [];
  if (CLAUDE_TRAILER.test(message)) out.push('trailer:claude');
  if (CURSOR_COAUTHOR.test(message)) out.push('coauthor:cursor-agent');
  if (COPILOT_COAUTHOR.test(message)) out.push('coauthor:copilot-swe-agent[bot]');
  return out;
}

/** Which agent a stored signal string points at (for audits and tie-breaks). */
export function signalAgent(signal: string): AgentSlug {
  if (signal.startsWith('aidev:')) return aidevAgentToSlug(signal.slice(6));
  if (signal === 'trailer:claude' || signal === 'author:claude[bot]' || signal === 'branch:claude/')
    return 'claude-code';
  if (signal === 'coauthor:cursor-agent' || signal === 'branch:cursor/') return 'cursor';
  if (
    signal === 'author:copilot' ||
    signal === 'author:copilot-swe-agent[bot]' ||
    signal === 'coauthor:copilot-swe-agent[bot]' ||
    signal === 'branch:copilot/'
  )
    return 'github-copilot';
  if (signal === 'author:devin-ai-integration[bot]') return 'devin';
  if (signal === 'branch:codex/') return 'openai-codex';
  return 'unknown';
}

/** GitHub avatar URL from the numeric user id — no API call, no email. */
export function avatarUrl(githubUserId: number | bigint): string {
  return `https://avatars.githubusercontent.com/u/${githubUserId}?v=4`;
}

// Machine accounts that GitHub types as "User" (no [bot] suffix) still flood
// review threads; the common CI/review bots are named here so a reviewer
// excerpt is a human's words. Conservative on purpose — the publish spot
// check catches stragglers.
const MACHINE_LOGINS = new Set([
  'copilot', 'k8s-ci-robot', 'codecov', 'codecov-commenter', 'coderabbitai',
  'sonarcloud', 'netlify', 'vercel', 'github-actions', 'dependabot',
  'renovate-bot', 'greenkeeper', 'mergify', 'stale', 'cla-assistant',
]);

export function isBotLogin(login: string): boolean {
  const lower = login.toLowerCase();
  return (
    lower.endsWith('[bot]') ||
    lower.endsWith('-robot') ||
    lower.endsWith('-ci-bot') ||
    MACHINE_LOGINS.has(lower)
  );
}
