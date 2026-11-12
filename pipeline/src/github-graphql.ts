// GitHub GraphQL batching: 20–50 PRs per query via aliases, one fragment, a
// rateLimit read on every response (sleep to resetAt under 200 points), and a
// 15-minute pause after three consecutive 5xx responses (brief, Rate limits).

import { isBotLogin } from './agents.ts';

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

// --- user profiles -----------------------------------------------------------
// Public profile fields for attribution (docs/flight-log-corpus.md, Consent
// and footprint). 25 per query: the point cost is tiny (~5 per batch), but a
// README blob makes each response heavy. The profile README lives in the
// repository named after the login; GitHub renders README.md at HEAD.

export const USER_BATCH = 25;
const README_MAX_BYTES = 100_000;

export function buildUserBatchQuery(logins: string[]): string {
  const parts = logins.map(
    (login, i) =>
      `u${i}: user(login: ${JSON.stringify(login)}) {` +
      ` databaseId login name bio company websiteUrl` +
      ` socialAccounts(first: 5) { nodes { provider url } }` +
      ` repository(name: ${JSON.stringify(login)}) { object(expression: "HEAD:README.md") {` +
      ` ... on Blob { text byteSize isTruncated isBinary } } } }`,
  );
  return `query {\n${parts.join('\n')}\nrateLimit { remaining resetAt cost }\n}`;
}

export type UserProfile = {
  databaseId: number | null;
  login: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  websiteUrl: string | null;
  /** https links only, at most five. */
  socialUrls: string[];
  /** The README markdown, or null when missing, binary, truncated or over 100 kB. */
  readmeText: string | null;
};

export function parseUserNode(node: unknown): UserProfile | null {
  const u = node as Record<string, unknown> | null;
  if (!u || typeof u.login !== 'string') return null;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const socials = (u.socialAccounts as { nodes?: { provider?: string; url?: unknown }[] } | null)?.nodes ?? [];
  const blob = (u.repository as {
    object?: { text?: unknown; byteSize?: number; isTruncated?: boolean; isBinary?: boolean } | null;
  } | null)?.object ?? null;
  const readmeOk =
    !!blob && typeof blob.text === 'string' && !blob.isBinary && !blob.isTruncated &&
    (blob.byteSize ?? 0) <= README_MAX_BYTES;
  return {
    databaseId: typeof u.databaseId === 'number' ? u.databaseId : null,
    login: u.login,
    name: str(u.name),
    bio: str(u.bio),
    company: str(u.company),
    websiteUrl: str(u.websiteUrl),
    socialUrls: socials
      .map((n) => n.url)
      .filter((url): url is string => typeof url === 'string' && /^https:\/\//.test(url))
      .slice(0, 5),
    readmeText: readmeOk ? (blob!.text as string) : null,
  };
}

// --- GitHub Sponsors graph ---------------------------------------------------
// docs/flight-log-corpus.md, Sponsors graph. Public sponsorships only (GitHub
// never returns private ones to another account's token) and no amounts.
// Fields are spelled out per concrete type (User, Organization) rather than
// through the Sponsorable interface, and neighbours carry hasSponsorsListing so
// an account at the hop limit is still known to be sponsorable — scalar fields
// on connection nodes cost no extra requests.

export const ACCOUNT_BATCH = 20;
export const FUNDING_BATCH = 50;
export const CONNECTION_PAGE = 100;

export type SponsorConnectionField = 'sponsors' | 'sponsoring';
type OwnerKind = 'User' | 'Organization';

const NEIGHBOR_NODE =
  'nodes { __typename ... on User { login databaseId hasSponsorsListing }' +
  ' ... on Organization { login databaseId hasSponsorsListing } }';

function connection(field: SponsorConnectionField, after?: string): string {
  const cursor = after ? `, after: ${JSON.stringify(after)}` : '';
  return `${field}(first: ${CONNECTION_PAGE}${cursor}) { totalCount pageInfo { hasNextPage endCursor } ${NEIGHBOR_NODE} }`;
}

const ACCOUNT_FIELDS =
  'login databaseId hasSponsorsListing sponsorsListing { shortDescription } ' +
  `${connection('sponsors')} ${connection('sponsoring')} ` +
  'repositories(first: 5, privacy: PUBLIC, isFork: false, ownerAffiliations: [OWNER],' +
  ' orderBy: { field: STARGAZERS, direction: DESC }) {' +
  ' nodes { nameWithOwner stargazerCount description repositoryTopics(first: 10) { nodes { topic { name } } } } }';

/** Accounts by login, ACCOUNT_BATCH per query: listing, both connections' first page, top repos. */
export function buildAccountBatchQuery(logins: string[]): string {
  const parts = logins.map(
    (login, i) =>
      `a${i}: repositoryOwner(login: ${JSON.stringify(login)}) { __typename ...AccountUser ...AccountOrg }`,
  );
  return (
    `query {\n${parts.join('\n')}\nrateLimit { remaining resetAt cost }\n}\n` +
    `fragment AccountUser on User { ${ACCOUNT_FIELDS} }\n` +
    `fragment AccountOrg on Organization { ${ACCOUNT_FIELDS} }`
  );
}

/** The next page of one account's sponsors or sponsoring connection. */
export function buildConnectionPageQuery(login: string, field: SponsorConnectionField, after: string): string {
  const conn = connection(field, after);
  return (
    `query {\no: repositoryOwner(login: ${JSON.stringify(login)}) { __typename` +
    ` ... on User { databaseId ${conn} } ... on Organization { databaseId ${conn} } }\n` +
    `rateLimit { remaining resetAt cost }\n}`
  );
}

/** FUNDING.yml links and the owner's identity for catalogued repos, FUNDING_BATCH per query. */
export function buildRepoFundingBatchQuery(repos: { owner: string; name: string }[]): string {
  const parts = repos.map(
    (r, i) =>
      `r${i}: repository(owner: ${JSON.stringify(r.owner)}, name: ${JSON.stringify(r.name)}) {` +
      ` nameWithOwner owner { __typename login ... on User { databaseId } ... on Organization { databaseId } }` +
      ` fundingLinks { platform url } }`,
  );
  return `query {\n${parts.join('\n')}\nrateLimit { remaining resetAt cost }\n}`;
}

export type SponsorNeighbor = {
  githubId: number;
  login: string;
  kind: OwnerKind;
  hasSponsorsListing: boolean | null;
};

export type SponsorConnection = {
  totalCount: number;
  hasNextPage: boolean;
  endCursor: string | null;
  nodes: SponsorNeighbor[];
};

export type TopRepo = { name_with_owner: string; stars: number; description: string | null; topics: string[] };

export type SponsorAccount = {
  githubId: number;
  login: string;
  kind: OwnerKind;
  hasSponsorsListing: boolean;
  listingShortDescription: string | null;
  sponsors: SponsorConnection;
  sponsoring: SponsorConnection;
  topRepos: TopRepo[];
};

const ownerKind = (t: unknown): OwnerKind | null =>
  t === 'User' || t === 'Organization' ? t : null;

/** A sponsors/sponsoring connection; nodes without a login or numeric id (ghosts) are dropped. */
export function parseSponsorConnection(conn: unknown): SponsorConnection {
  const c = conn as {
    totalCount?: number;
    pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
    nodes?: ({ __typename?: string; login?: unknown; databaseId?: unknown; hasSponsorsListing?: unknown } | null)[];
  } | null;
  const nodes: SponsorNeighbor[] = [];
  for (const n of c?.nodes ?? []) {
    const kind = ownerKind(n?.__typename);
    if (!n || !kind || typeof n.login !== 'string' || typeof n.databaseId !== 'number') continue;
    nodes.push({
      githubId: n.databaseId,
      login: n.login,
      kind,
      hasSponsorsListing: typeof n.hasSponsorsListing === 'boolean' ? n.hasSponsorsListing : null,
    });
  }
  return {
    totalCount: typeof c?.totalCount === 'number' ? c.totalCount : nodes.length,
    hasNextPage: c?.pageInfo?.hasNextPage === true,
    endCursor: c?.pageInfo?.endCursor ?? null,
    nodes,
  };
}

const DESCRIPTION_MAX = 200;

export function parseAccountNode(node: unknown): SponsorAccount | null {
  const a = node as Record<string, unknown> | null;
  const kind = ownerKind(a?.__typename);
  if (!a || !kind || typeof a.login !== 'string' || typeof a.databaseId !== 'number') return null;
  const listing = a.sponsorsListing as { shortDescription?: unknown } | null;
  const repoNodes = (a.repositories as { nodes?: unknown[] } | null)?.nodes ?? [];
  const topRepos: TopRepo[] = [];
  for (const raw of repoNodes) {
    const r = raw as {
      nameWithOwner?: unknown;
      stargazerCount?: unknown;
      description?: unknown;
      repositoryTopics?: { nodes?: { topic?: { name?: unknown } }[] };
    } | null;
    if (!r || typeof r.nameWithOwner !== 'string') continue;
    const description = typeof r.description === 'string' ? r.description.replace(/\s+/g, ' ').trim() : '';
    topRepos.push({
      name_with_owner: r.nameWithOwner,
      stars: typeof r.stargazerCount === 'number' ? r.stargazerCount : 0,
      description: description ? Array.from(description).slice(0, DESCRIPTION_MAX).join('') : null,
      topics: (r.repositoryTopics?.nodes ?? [])
        .map((t) => t?.topic?.name)
        .filter((t): t is string => typeof t === 'string'),
    });
  }
  const short = typeof listing?.shortDescription === 'string' ? listing.shortDescription.replace(/\s+/g, ' ').trim() : '';
  return {
    githubId: a.databaseId,
    login: a.login,
    kind,
    hasSponsorsListing: a.hasSponsorsListing === true,
    listingShortDescription: short ? Array.from(short).slice(0, 300).join('') : null,
    sponsors: parseSponsorConnection(a.sponsors),
    sponsoring: parseSponsorConnection(a.sponsoring),
    topRepos,
  };
}

export type RepoFunding = {
  owner: { githubId: number; login: string; kind: OwnerKind } | null;
  links: { platform: string; url: string; githubLogin: string | null }[];
};

/** github.com/<login> or github.com/sponsors/<login> → login; anything else → null. */
export function githubLoginFromFundingUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.hostname !== 'github.com' && u.hostname !== 'www.github.com') return null;
  const parts = u.pathname.split('/').filter(Boolean);
  const login = parts[0] === 'sponsors' ? parts[1] : parts[0];
  return login && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(login) ? login : null;
}

export function parseFundingNode(node: unknown): RepoFunding | null {
  const r = node as {
    owner?: { __typename?: string; login?: unknown; databaseId?: unknown } | null;
    fundingLinks?: { platform?: unknown; url?: unknown }[];
  } | null;
  if (!r) return null;
  const kind = ownerKind(r.owner?.__typename);
  const owner =
    r.owner && kind && typeof r.owner.login === 'string' && typeof r.owner.databaseId === 'number'
      ? { githubId: r.owner.databaseId, login: r.owner.login, kind }
      : null;
  const links: RepoFunding['links'] = [];
  for (const l of r.fundingLinks ?? []) {
    if (typeof l?.platform !== 'string' || typeof l.url !== 'string') continue;
    if (!/^https?:\/\//i.test(l.url)) continue;
    links.push({
      platform: l.platform,
      url: l.url,
      githubLogin: l.platform === 'GITHUB' ? githubLoginFromFundingUrl(l.url) : null,
    });
  }
  return { owner, links };
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
  // Totals from GraphQL totalCount, so review/comment counts are correct even
  // when the PR has more than the first page (50) we fetch the bodies for.
  reviewsTotal: number;
  commentsTotal: number;
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

// GitHub's GraphQL __typename of Bot, plus the same machine-account heuristics
// the AIDev loader uses (isBotLogin: [bot] suffix, -robot, k8s-ci-robot,
// codecov, …) — otherwise a CI account GitHub types as User counts as a human
// reviewer and can supply a burn's reviewer excerpt.
const isBotAuthor = (a: AuthorNode) => !!a && (a.__typename === 'Bot' || isBotLogin(a.login));

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
    reviewsTotal: Number(reviews?.totalCount ?? (reviews?.nodes ?? []).length),
    commentsTotal: Number(comments?.totalCount ?? (comments?.nodes ?? []).length),
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
