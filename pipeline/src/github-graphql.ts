// GitHub GraphQL batching: 20–50 PRs per query via aliases, one fragment, a
// rateLimit read on every response (sleep to resetAt under 200 points), and a
// 15-minute pause after three consecutive 5xx responses (brief, Rate limits).

export type PrRef = { owner: string; name: string; number: number };

const PR_FRAGMENT = `
fragment PrFields on PullRequest {
  fullDatabaseId
  number
  title
  bodyText
  state
  merged
  createdAt
  mergedAt
  closedAt
  additions
  deletions
  changedFiles
  headRefName
  url
  author {
    __typename
    login
    ... on User { databaseId }
    ... on Bot { databaseId }
  }
  commits(first: 100) {
    totalCount
    nodes { commit { message committedDate } }
  }
  reviews(first: 50) {
    totalCount
    nodes {
      state
      submittedAt
      url
      bodyText
      author { __typename login }
    }
  }
  reviewThreads(first: 50) {
    nodes { comments(first: 5) { totalCount } }
  }
  comments(first: 50) {
    totalCount
    nodes { bodyText createdAt url author { __typename login } }
  }
  timelineItems(first: 100, itemTypes: [LABELED_EVENT, CLOSED_EVENT, MERGED_EVENT]) {
    nodes {
      __typename
      ... on LabeledEvent { createdAt actor { login } label { name } }
      ... on ClosedEvent { createdAt actor { login } url }
      ... on MergedEvent { createdAt actor { login } url }
    }
  }
  repository {
    databaseId
    nameWithOwner
    stargazerCount
    isFork
    primaryLanguage { name }
    licenseInfo { spdxId }
  }
}`;

export function buildPrBatchQuery(refs: PrRef[]): string {
  const parts = refs.map(
    (r, i) =>
      `p${i}: repository(owner: ${JSON.stringify(r.owner)}, name: ${JSON.stringify(r.name)}) {` +
      ` pullRequest(number: ${Math.trunc(r.number)}) { ...PrFields } }`,
  );
  return `query {\n${parts.join('\n')}\nrateLimit { remaining resetAt cost }\n}\n${PR_FRAGMENT}`;
}

export function buildRepoBatchQuery(repos: { owner: string; name: string }[]): string {
  const parts = repos.map(
    (r, i) =>
      `r${i}: repository(owner: ${JSON.stringify(r.owner)}, name: ${JSON.stringify(r.name)}) {` +
      ` databaseId nameWithOwner stargazerCount isFork primaryLanguage { name } licenseInfo { spdxId } }`,
  );
  return `query {\n${parts.join('\n')}\nrateLimit { remaining resetAt cost }\n}`;
}

export type GraphqlResult = {
  data?: Record<string, unknown> & {
    rateLimit?: { remaining: number; resetAt: string; cost: number };
  };
  errors?: { message: string; path?: (string | number)[]; type?: string }[];
};

export type GraphqlClientOptions = {
  token: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  lowWater?: number;
  pauseMs?: number;
  userAgent?: string;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class GraphqlClient {
  #opts: Required<Omit<GraphqlClientOptions, 'token'>> & { token: string };
  #consecutive5xx = 0;
  lastRemaining: number | null = null;

  constructor(opts: GraphqlClientOptions) {
    this.#opts = {
      token: opts.token,
      fetchImpl: opts.fetchImpl ?? fetch,
      sleep: opts.sleep ?? defaultSleep,
      lowWater: opts.lowWater ?? 200,
      pauseMs: opts.pauseMs ?? 15 * 60 * 1000,
      userAgent: opts.userAgent ?? 'agentriders-flightlog',
    };
  }

  async request(query: string): Promise<GraphqlResult> {
    for (;;) {
      const res = await this.#opts.fetchImpl('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.#opts.token}`,
          'Content-Type': 'application/json',
          'User-Agent': this.#opts.userAgent,
        },
        body: JSON.stringify({ query }),
      });
      if (res.status >= 500) {
        this.#consecutive5xx++;
        if (this.#consecutive5xx >= 3) {
          console.log(`  three consecutive 5xx — pausing ${this.#opts.pauseMs / 60000} min`);
          await this.#opts.sleep(this.#opts.pauseMs);
          this.#consecutive5xx = 0;
        } else {
          await this.#opts.sleep(2000 * this.#consecutive5xx);
        }
        continue;
      }
      this.#consecutive5xx = 0;
      if (res.status === 403 || res.status === 429) {
        // Secondary rate limit: honor Retry-After, else back off a minute.
        const retryAfter = Number(res.headers.get('retry-after') ?? '60');
        await this.#opts.sleep(Math.max(retryAfter, 10) * 1000);
        continue;
      }
      if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${await res.text()}`);
      const body = (await res.json()) as GraphqlResult;
      const rl = body.data?.rateLimit;
      if (rl) {
        this.lastRemaining = rl.remaining;
        if (rl.remaining < this.#opts.lowWater) {
          const waitMs = Math.max(0, Date.parse(rl.resetAt) - Date.now()) + 5000;
          console.log(`  rateLimit low (${rl.remaining}) — sleeping to resetAt (+5s)`);
          await this.#opts.sleep(waitMs);
        }
      }
      return body;
    }
  }
}

// --- parsing -----------------------------------------------------------------

type AuthorNode = { __typename: string; login: string; databaseId?: number } | null;

export type EnrichedPr = {
  ghPrId: number | null;
  number: number;
  title: string;
  bodyText: string;
  state: 'open' | 'merged' | 'closed';
  createdAt: string | null;
  mergedAt: string | null;
  closedAt: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  headRefName: string;
  authorLogin: string | null;
  authorDatabaseId: number | null;
  authorIsBot: boolean;
  commitMessages: string[];
  commitsTotal: number;
  reviews: {
    state: string;
    submittedAt: string | null;
    url: string | null;
    body: string;
    authorLogin: string | null;
    authorIsBot: boolean;
  }[];
  reviewCommentCount: number;
  comments: {
    body: string;
    createdAt: string | null;
    url: string | null;
    authorLogin: string | null;
    authorIsBot: boolean;
  }[];
  timeline: { kind: string; at: string | null; actor: string | null; url: string | null }[];
  repo: {
    databaseId: number | null;
    nameWithOwner: string | null;
    stargazerCount: number | null;
    isFork: boolean | null;
    primaryLanguage: string | null;
    license: string | null;
  };
  raw: unknown;
};

const isBotAuthor = (a: AuthorNode) =>
  !!a && (a.__typename === 'Bot' || a.login.endsWith('[bot]') || a.login.toLowerCase() === 'copilot');

export function parsePrNode(node: unknown): EnrichedPr | null {
  const pr = (node as { pullRequest?: Record<string, unknown> } | null)?.pullRequest;
  if (!pr) return null;
  const author = pr.author as AuthorNode;
  const commits = pr.commits as { totalCount: number; nodes: { commit: { message: string; committedDate: string } }[] };
  const reviews = pr.reviews as {
    totalCount: number;
    nodes: { state: string; submittedAt: string | null; url: string | null; bodyText: string; author: AuthorNode }[];
  };
  const threads = pr.reviewThreads as { nodes: { comments: { totalCount: number } }[] };
  const comments = pr.comments as {
    totalCount: number;
    nodes: { bodyText: string; createdAt: string | null; url: string | null; author: AuthorNode }[];
  };
  const timelineItems = pr.timelineItems as {
    nodes: {
      __typename: string;
      createdAt?: string;
      actor?: { login: string } | null;
      url?: string;
      label?: { name: string };
    }[];
  };
  const repo = pr.repository as {
    databaseId: number | null;
    nameWithOwner: string;
    stargazerCount: number;
    isFork: boolean;
    primaryLanguage: { name: string } | null;
    licenseInfo: { spdxId: string } | null;
  } | null;

  const state = pr.merged ? 'merged' : String(pr.state) === 'OPEN' ? 'open' : 'closed';
  const commitNodes = commits?.nodes ?? [];
  const timeline = (timelineItems?.nodes ?? []).flatMap((t) => {
    const kind =
      t.__typename === 'LabeledEvent' ? 'labeled'
      : t.__typename === 'ClosedEvent' ? 'closed'
      : t.__typename === 'MergedEvent' ? 'merged'
      : null;
    return kind ? [{ kind, at: t.createdAt ?? null, actor: t.actor?.login ?? null, url: t.url ?? null }] : [];
  });
  for (const c of commitNodes) {
    timeline.push({ kind: 'committed', at: c.commit.committedDate ?? null, actor: null, url: null });
  }

  return {
    ghPrId: pr.fullDatabaseId ? Number(pr.fullDatabaseId) : null,
    number: Number(pr.number),
    title: String(pr.title ?? ''),
    bodyText: String(pr.bodyText ?? ''),
    state,
    createdAt: (pr.createdAt as string) ?? null,
    mergedAt: (pr.mergedAt as string) ?? null,
    closedAt: (pr.closedAt as string) ?? null,
    additions: Number(pr.additions ?? 0),
    deletions: Number(pr.deletions ?? 0),
    changedFiles: Number(pr.changedFiles ?? 0),
    headRefName: String(pr.headRefName ?? ''),
    authorLogin: author?.login ?? null,
    authorDatabaseId: author?.databaseId ?? null,
    authorIsBot: isBotAuthor(author),
    commitMessages: commitNodes.map((c) => c.commit.message),
    commitsTotal: Number(commits?.totalCount ?? commitNodes.length),
    reviews: (reviews?.nodes ?? []).map((r) => ({
      state: r.state,
      submittedAt: r.submittedAt,
      url: r.url,
      body: r.bodyText ?? '',
      authorLogin: r.author?.login ?? null,
      authorIsBot: isBotAuthor(r.author),
    })),
    reviewCommentCount: (threads?.nodes ?? []).reduce((n, t) => n + (t.comments?.totalCount ?? 0), 0),
    comments: (comments?.nodes ?? []).map((c) => ({
      body: c.bodyText ?? '',
      createdAt: c.createdAt,
      url: c.url,
      authorLogin: c.author?.login ?? null,
      authorIsBot: isBotAuthor(c.author),
    })),
    timeline,
    repo: {
      databaseId: repo?.databaseId ?? null,
      nameWithOwner: repo?.nameWithOwner ?? null,
      stargazerCount: repo?.stargazerCount ?? null,
      isFork: repo?.isFork ?? null,
      primaryLanguage: repo?.primaryLanguage?.name ?? null,
      license: repo?.licenseInfo?.spdxId ?? null,
    },
    raw: pr,
  };
}
