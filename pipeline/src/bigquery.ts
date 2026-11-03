// BigQuery over REST with a service account — no Google SDK. The only use is
// one query per day over one GH Archive day table, selecting only the columns
// used (billed per byte scanned; never SELECT * on month tables).
//
// Auth: standard service-account JWT bearer flow, signed with node:crypto.
// BQ_SERVICE_ACCOUNT_JSON holds the service account key JSON (client_email,
// private_key, project_id).

import { createSign } from 'node:crypto';

type ServiceAccount = { client_email: string; private_key: string; project_id: string };

export function parseServiceAccount(json: string): ServiceAccount {
  const sa = JSON.parse(json) as Partial<ServiceAccount>;
  if (!sa.client_email || !sa.private_key || !sa.project_id) {
    throw new Error('BQ_SERVICE_ACCOUNT_JSON must contain client_email, private_key, project_id');
  }
  return sa as ServiceAccount;
}

const b64url = (s: string | Buffer) =>
  Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function buildJwt(sa: ServiceAccount, nowSecs = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/bigquery.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: nowSecs,
      exp: nowSecs + 3600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(sa.private_key);
  return `${header}.${claims}.${b64url(signature)}`;
}

async function accessToken(sa: ServiceAccount): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: buildJwt(sa),
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

export type BqRow = Record<string, string | null>;

/** Run a query; returns flat rows keyed by column name (all values strings). */
export async function bigquery(
  saJson: string,
  sql: string,
  { maxResults = 50_000, timeoutMs = 120_000 } = {},
): Promise<{ rows: BqRow[]; bytesProcessed: number }> {
  const sa = parseServiceAccount(saJson);
  const token = await accessToken(sa);
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${sa.project_id}/queries`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, useLegacySql: false, maxResults, timeoutMs }),
  });
  if (!res.ok) throw new Error(`bigquery query failed: ${res.status} ${await res.text()}`);
  type QueryResponse = {
    jobComplete?: boolean;
    totalBytesProcessed?: string;
    schema?: { fields: { name: string }[] };
    rows?: { f: { v: unknown }[] }[];
    pageToken?: string;
    jobReference?: { jobId: string; location?: string };
  };
  let body = (await res.json()) as QueryResponse;
  if (!body.jobComplete) throw new Error('bigquery job did not complete within timeoutMs');

  const fields = body.schema?.fields.map((f) => f.name) ?? [];
  const rows: BqRow[] = [];
  const collect = (page: QueryResponse) => {
    for (const r of page.rows ?? []) {
      const row: BqRow = {};
      r.f.forEach((cell, i) => {
        row[fields[i]] = cell.v === null || cell.v === undefined ? null : String(cell.v);
      });
      rows.push(row);
    }
  };
  collect(body);
  while (body.pageToken && body.jobReference) {
    const pageUrl = new URL(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${sa.project_id}/queries/${body.jobReference.jobId}`,
    );
    pageUrl.searchParams.set('pageToken', body.pageToken);
    pageUrl.searchParams.set('maxResults', String(maxResults));
    if (body.jobReference.location) pageUrl.searchParams.set('location', body.jobReference.location);
    const pageRes = await fetch(pageUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!pageRes.ok) throw new Error(`bigquery page failed: ${pageRes.status}`);
    const page = (await pageRes.json()) as QueryResponse;
    collect(page);
    body.pageToken = page.pageToken;
  }
  return { rows, bytesProcessed: Number(body.totalBytesProcessed ?? 0) };
}

/**
 * The daily discovery query (brief, Pipeline step 4): opened PRs whose author
 * is a known bot login, whose head ref starts with an agent prefix, or whose
 * branch received a push with a co-author trailer naming an agent — plus
 * closed events for state updates. One day table, only the columns used.
 */
export function discoverySql(dateYYYYMMDD: string): string {
  if (!/^\d{8}$/.test(dateYYYYMMDD)) throw new Error(`bad date: ${dateYYYYMMDD}`);
  const table = `\`githubarchive.day.${dateYYYYMMDD}\``;
  return `
WITH prs AS (
  SELECT repo.name AS repo,
         JSON_VALUE(payload, '$.pull_request.number') AS number,
         JSON_VALUE(payload, '$.pull_request.id') AS pr_id,
         JSON_VALUE(payload, '$.pull_request.user.login') AS login,
         JSON_VALUE(payload, '$.pull_request.user.id') AS user_id,
         JSON_VALUE(payload, '$.pull_request.head.ref') AS head_ref,
         JSON_VALUE(payload, '$.pull_request.merged') AS merged,
         JSON_VALUE(payload, '$.action') AS action,
         created_at
  FROM ${table}
  WHERE type = 'PullRequestEvent'
),
pushes AS (
  SELECT DISTINCT repo.name AS repo,
         REGEXP_REPLACE(JSON_VALUE(payload, '$.ref'), '^refs/heads/', '') AS head_ref
  FROM ${table}, UNNEST(JSON_QUERY_ARRAY(payload, '$.commits')) AS c
  WHERE type = 'PushEvent'
    AND REGEXP_CONTAINS(JSON_VALUE(c, '$.message'), r'(?i)co-authored-by:.*(claude|cursor|copilot)')
),
agentish AS (
  SELECT p.*, (u.repo IS NOT NULL) AS coauthor_push
  FROM prs p LEFT JOIN pushes u USING (repo, head_ref)
  WHERE p.login IN ('devin-ai-integration[bot]', 'Copilot', 'claude[bot]')
     OR REGEXP_CONTAINS(p.head_ref, r'^(copilot|claude|cursor|codex)/')
     OR u.repo IS NOT NULL
)
SELECT repo, number, pr_id, login, user_id, head_ref, action, merged, coauthor_push,
       CAST(created_at AS STRING) AS created_at
FROM agentish
WHERE action IN ('opened', 'closed', 'reopened')
ORDER BY repo, number, created_at`.trim();
}
