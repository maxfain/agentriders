// Git is canonical for published logs; this keeps the published_logs D1
// mirror in step with the live /logs.json so ranks, profiles and the
// directory gate can be queried per request. It also flips approved
// submissions to 'published' once their file actually appears live.
//
// Runs lazily when the admin queue, /me, or the directory renders —
// KV-throttled so it fires at most once a minute. Any failure is swallowed:
// reconciliation must never break a page render, and the log is already
// live in git regardless of the mirror's freshness.

type Env = { DB: D1Database; RATE: KVNamespace };

type LogsJsonEntry = {
  url: string;
  title: string;
  date: string;
  rider: string;
  task: string;
  outcome: string;
  burns: unknown[];
};

const THROTTLE_KEY = 'reconcile:last';
const THROTTLE_SECONDS = 60;

function slugFromUrl(url: string): string | null {
  const m = /\/logs\/([^/?#]+)/.exec(url);
  return m ? m[1] : null;
}

export type ReconcileResult = { ran: boolean; published: number; mirrored: number };

export async function reconcile(
  env: Env,
  origin: string,
  opts: { force?: boolean } = {},
): Promise<ReconcileResult> {
  try {
    if (!opts.force) {
      const last = await env.RATE.get(THROTTLE_KEY);
      if (last) return { ran: false, published: 0, mirrored: 0 };
      await env.RATE.put(THROTTLE_KEY, String(Date.now()), { expirationTtl: THROTTLE_SECONDS });
    }

    const res = await fetch(`${origin}/logs.json`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return { ran: false, published: 0, mirrored: 0 };
    const logs = (await res.json()) as LogsJsonEntry[];
    if (!Array.isArray(logs)) return { ran: false, published: 0, mirrored: 0 };

    // Resolve handles → rider ids in one query.
    const handles = [...new Set(logs.map((l) => l.rider).filter(Boolean))];
    const handleToId = new Map<string, string>();
    if (handles.length) {
      const placeholders = handles.map(() => '?').join(',');
      const rows = await env.DB.prepare(
        `SELECT id, handle FROM riders WHERE handle IN (${placeholders})`,
      )
        .bind(...handles)
        .all<{ id: string; handle: string }>();
      for (const r of rows.results ?? []) handleToId.set(r.handle, r.id);
    }

    // Which approved submissions can now flip to published (their slug is live).
    const liveSlugs = new Set(logs.map((l) => slugFromUrl(l.url)).filter(Boolean) as string[]);
    const approved = await env.DB.prepare(
      "SELECT id, slug, rider_id FROM submissions WHERE status = 'approved'",
    ).all<{ id: string; slug: string; rider_id: string }>();
    const slugToSubmission = new Map<string, { id: string; rider_id: string }>();
    for (const s of approved.results ?? []) {
      if (liveSlugs.has(s.slug)) slugToSubmission.set(s.slug, { id: s.id, rider_id: s.rider_id });
    }

    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];
    let published = 0;

    for (const log of logs) {
      const slug = slugFromUrl(log.url);
      if (!slug) continue;
      const submission = slugToSubmission.get(slug);
      const riderId = submission?.rider_id ?? handleToId.get(log.rider) ?? null;

      statements.push(
        env.DB.prepare(
          `INSERT INTO published_logs
             (slug, rider_id, title, date, task, outcome, burns_count, submission_id, published_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(slug) DO UPDATE SET
             rider_id = COALESCE(excluded.rider_id, published_logs.rider_id),
             title = excluded.title,
             date = excluded.date,
             task = excluded.task,
             outcome = excluded.outcome,
             burns_count = excluded.burns_count,
             submission_id = COALESCE(published_logs.submission_id, excluded.submission_id)`,
        ).bind(
          slug,
          riderId,
          log.title,
          log.date,
          log.task,
          log.outcome,
          Array.isArray(log.burns) ? log.burns.length : 0,
          submission?.id ?? null,
          now,
        ),
      );

      if (submission) {
        statements.push(
          env.DB.prepare(
            "UPDATE submissions SET status = 'published', published_at = ?, updated_at = ? WHERE id = ? AND status = 'approved'",
          ).bind(now, now, submission.id),
        );
        published += 1;
      }
    }

    if (statements.length) await env.DB.batch(statements);
    return { ran: true, published, mirrored: logs.length };
  } catch {
    return { ran: false, published: 0, mirrored: 0 };
  }
}
