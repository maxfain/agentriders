// Hugging Face dataset download: plain HTTPS fetches of the parquet files at
// a pinned revision — the Node equivalent of snapshot_download for the few
// files we need. Re-runs skip files that already exist with the right size.

import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const DATASET = 'hao-li/AIDev';

export const AIDEV_FILES = [
  'all_pull_request.parquet',
  'all_repository.parquet',
  'all_user.parquet',
  'pull_request.parquet',
  'repository.parquet',
  'user.parquet',
  'pr_task_type.parquet',
  'pr_reviews.parquet',
  'pr_review_comments.parquet',
  'pr_comments.parquet',
  'pr_commits.parquet',
  'pr_commit_details.parquet',
  'pr_timeline.parquet',
  'issue.parquet',
  'related_issue.parquet',
  'README.md',
] as const;

export async function downloadAidev(
  dir: string,
  revision = 'v3',
  files: readonly string[] = AIDEV_FILES,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  for (const name of files) {
    const dest = join(dir, name);
    const url = `https://huggingface.co/datasets/${DATASET}/resolve/${revision}/${name}`;
    const head = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (!head.ok) throw new Error(`HEAD ${url} -> ${head.status}`);
    const expected = Number(head.headers.get('content-length') ?? '0');
    const existing = await stat(dest).catch(() => null);
    if (existing && expected > 0 && existing.size === expected) {
      console.log(`  kept ${name} (${(expected / 1e6).toFixed(1)} MB)`);
      continue;
    }
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok || !res.body) throw new Error(`GET ${url} -> ${res.status}`);
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
    console.log(`  downloaded ${name} (${(expected / 1e6).toFixed(1)} MB)`);
  }
}
