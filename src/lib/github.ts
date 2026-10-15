// Commits an approved flight log to src/content/logs/<slug>.md via the
// GitHub Contents API, using the agentriders-bot fine-grained PAT
// (contents R/W on this repo only). Git stays canonical: this is the one
// writer. The committer is the bot; the author is credited to the rider.

const DEFAULT_REPO = 'maxfain/agentriders';
const LOGS_DIR = 'src/content/logs';
const COMMITTER = { name: 'agentriders-bot', email: 'bot@agentriders.com' };
const DEFAULT_API = 'https://api.github.com';

type Env = {
  GITHUB_BOT_TOKEN?: string;
  GITHUB_REPO?: string;
  GITHUB_BRANCH?: string;
  // Local testing only — points the Contents API at a mock.
  GITHUB_API_BASE?: string;
};

function repoOf(env: Env): string {
  return env.GITHUB_REPO || DEFAULT_REPO;
}

function apiBase(env: Env): string {
  return env.GITHUB_API_BASE || DEFAULT_API;
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'agentriders.com',
  };
}

// UTF-8 safe base64 (btoa is Latin-1 only; logs carry em-dashes etc.).
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function fromBase64(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function logPath(slug: string): string {
  return `${LOGS_DIR}/${slug}.md`;
}

export type GitHubFile = { sha: string; markdown: string };

/** Current file (sha + decoded markdown), or null if it does not exist. */
export async function getLogFile(env: Env, slug: string): Promise<GitHubFile | null> {
  if (!env.GITHUB_BOT_TOKEN) throw new Error('GITHUB_BOT_TOKEN is not configured.');
  const url = `${apiBase(env)}/repos/${repoOf(env)}/contents/${logPath(slug)}${
    env.GITHUB_BRANCH ? `?ref=${env.GITHUB_BRANCH}` : ''
  }`;
  const res = await fetch(url, { headers: headers(env.GITHUB_BOT_TOKEN) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { sha: string; content: string };
  return { sha: body.sha, markdown: fromBase64(body.content) };
}

export type CommitInput = {
  slug: string;
  markdown: string;
  handle: string;
  displayName: string;
  /** 'new' omits sha and fails if the path already exists; 'edit' requires it. */
  kind: 'new' | 'edit';
};

/**
 * Create or update the log file. On a sha conflict (someone pushed between
 * our read and write) we re-read and retry once, then surface the error so
 * the admin UI can park the submission visibly. Returns the commit sha.
 */
export async function commitLogFile(env: Env, input: CommitInput): Promise<string> {
  if (!env.GITHUB_BOT_TOKEN) throw new Error('GITHUB_BOT_TOKEN is not configured.');
  const { slug, markdown, handle, displayName, kind } = input;
  const url = `${apiBase(env)}/repos/${repoOf(env)}/contents/${logPath(slug)}`;
  const author = {
    name: displayName,
    // Per-rider noreply address; keeps the real email out of git history.
    email: `${handle}@riders.agentriders.com`,
  };
  const message = `Publish flight log: ${slug} (submitted by @${handle} via agentriders.com)`;

  const existing = await getLogFile(env, slug);
  if (kind === 'new' && existing) {
    throw new Error(`A log already exists at ${logPath(slug)}.`);
  }
  if (kind === 'edit' && !existing) {
    throw new Error(`No log to edit at ${logPath(slug)}.`);
  }

  const put = async (sha: string | undefined) => {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...headers(env.GITHUB_BOT_TOKEN!), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        content: toBase64(markdown),
        branch: env.GITHUB_BRANCH || undefined,
        sha,
        committer: COMMITTER,
        author,
      }),
    });
    return res;
  };

  let res = await put(existing?.sha);
  // 409 = sha out of date (a human pushed in between). Re-read once, retry.
  if (res.status === 409) {
    const fresh = await getLogFile(env, slug);
    res = await put(fresh?.sha);
  }
  if (!res.ok) {
    throw new Error(`GitHub PUT ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const body = (await res.json()) as { commit: { sha: string } };
  return body.commit.sha;
}
