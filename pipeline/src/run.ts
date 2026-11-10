// Job dispatcher: node pipeline/src/run.ts <job> [flags]
// Every job is idempotent and re-runnable; each writes a pipeline_runs row.

import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { connect, migrate } from './db.ts';
import { createPostHogPipelineLogger } from './posthog-logs.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

const JOBS: Record<string, string> = {
  migrate: 'Apply pipeline/migrations/*.sql',
  'download-aidev': 'Download the pinned AIDev revision into --dir',
  'load-aidev': 'Backfill flights from AIDev parquet in --dir (core + pop)',
  'repo-metadata': 'GraphQL stars/language/license/fork for repos with flights',
  discover: 'GH Archive (BigQuery) discovery for --date (default: yesterday)',
  enrich: 'GraphQL enrichment of candidates and state changes',
  classify: 'Deterministic outcome classification',
  debrief: 'LLM debriefs for gated flights (validated, versioned)',
  publish: 'index_ok, aggregates refresh, OG cards, spot check',
  verify: 'Re-validate every indexed flight; drop debriefs that fail (--dry-run to report)',
  'refresh-open': 'Nightly re-enrichment of open flights',
  'refresh-repos': 'Weekly repo metadata refresh for repos with indexed flights',
  'rider-cards': 'Render rider share cards for riders with claims',
  'author-profiles': 'GraphQL public profile fields for authors with indexed flights (never fetched)',
  'refresh-authors': 'Monthly re-fetch of author profiles older than 30 days',
};

function usage(): never {
  console.log('usage: node pipeline/src/run.ts <job> [flags]\n');
  for (const [job, help] of Object.entries(JOBS)) console.log(`  ${job.padEnd(15)} ${help}`);
  process.exit(2);
}

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    dir: { type: 'string' },
    revision: { type: 'string', default: 'v3' },
    sample: { type: 'string' },
    date: { type: 'string' },
    'skip-core': { type: 'boolean', default: false },
    'skip-pop': { type: 'boolean', default: false },
    limit: { type: 'string' },
    concurrency: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    refresh: { type: 'boolean', default: false },
  },
});

const job = positionals[0];
if (!job || !(job in JOBS)) usage();

if (job === 'download-aidev') {
  const { downloadAidev } = await import('./hf.ts');
  await downloadAidev(values.dir ?? 'data/aidev', values.revision);
  process.exit(0);
}

// Concise failures: the message and the SQL error position, not a bundled
// driver's whole stack.
process.on('uncaughtException', (error: Error & { position?: string }) => {
  console.error(`FATAL: ${error.message}${error.position ? ` (position ${error.position})` : ''}`);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  const e = reason as Error & { position?: string };
  console.error(`FATAL: ${e?.message ?? e}${e?.position ? ` (position ${e.position})` : ''}`);
  process.exit(1);
});

const posthogLogs = createPostHogPipelineLogger();
const startedAt = Date.now();
posthogLogs.logger?.emit({
  severityText: 'info',
  body: 'pipeline_job_started',
  attributes: { job, dry_run: values['dry-run'] },
});

let db: Awaited<ReturnType<typeof connect>> | undefined;
let completed = false;
try {
  db = await connect();
  switch (job) {
    case 'migrate': {
      const files = await migrate(db, join(HERE, '..', 'migrations'));
      console.log(`applied ${files.length} migration file(s): ${files.join(', ')}`);
      break;
    }
    case 'load-aidev': {
      const { loadAidev } = await import('./jobs/load-aidev.ts');
      if (!values.dir) throw new Error('--dir <path to AIDev parquet> is required');
      await loadAidev(db, {
        dir: values.dir,
        sample: values.sample ? Number(values.sample) : undefined,
        skipCore: values['skip-core'],
        skipPop: values['skip-pop'],
      });
      break;
    }
    case 'repo-metadata': {
      const { repoMetadata } = await import('./jobs/repo-metadata.ts');
      await repoMetadata(db, { limit: values.limit ? Number(values.limit) : undefined });
      break;
    }
    case 'discover': {
      const { discover } = await import('./jobs/discover.ts');
      await discover(db, { date: values.date, dryRun: values['dry-run'] });
      break;
    }
    case 'enrich': {
      const { enrich } = await import('./jobs/enrich.ts');
      await enrich(db, { limit: values.limit ? Number(values.limit) : undefined });
      break;
    }
    case 'classify': {
      const { classifyJob } = await import('./jobs/classify.ts');
      await classifyJob(db);
      break;
    }
    case 'debrief': {
      const { debriefJob } = await import('./jobs/debrief.ts');
      await debriefJob(db, {
        limit: values.limit ? Number(values.limit) : undefined,
        concurrency: values.concurrency ? Number(values.concurrency) : undefined,
        dryRun: values['dry-run'],
      });
      break;
    }
    case 'publish': {
      const { publish } = await import('./jobs/publish.ts');
      await publish(db, { skipOg: values['dry-run'] });
      break;
    }
    case 'verify': {
      const { verify } = await import('./jobs/verify.ts');
      await verify(db, { apply: !values['dry-run'] });
      break;
    }
    case 'refresh-open': {
      const { refreshOpen } = await import('./jobs/refresh-open.ts');
      await refreshOpen(db, { limit: values.limit ? Number(values.limit) : undefined });
      break;
    }
    case 'refresh-repos': {
      const { repoMetadata } = await import('./jobs/repo-metadata.ts');
      await repoMetadata(db, { onlyIndexed: true });
      break;
    }
    case 'rider-cards': {
      const { riderCards } = await import('./jobs/rider-cards.ts');
      await riderCards(db);
      break;
    }
    case 'author-profiles': {
      const { authorProfiles } = await import('./jobs/author-profiles.ts');
      await authorProfiles(db, { limit: values.limit ? Number(values.limit) : undefined, refresh: values.refresh });
      break;
    }
    case 'refresh-authors': {
      const { authorProfiles } = await import('./jobs/author-profiles.ts');
      await authorProfiles(db, { limit: values.limit ? Number(values.limit) : undefined, refresh: true });
      break;
    }
    default:
      usage();
  }
  completed = true;
} finally {
  try {
    if (db) await db.end();
  } finally {
    posthogLogs.logger?.emit({
      severityText: completed ? 'info' : 'error',
      body: completed ? 'pipeline_job_completed' : 'pipeline_job_failed',
      attributes: { job, duration_ms: Date.now() - startedAt },
    });
    await posthogLogs.shutdown();
  }
}
