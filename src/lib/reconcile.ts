// Git is canonical for published logs; this keeps the published_logs D1
// mirror in step with the live /logs.json so ranks, profiles and the
// directory gate can be queried per request. It also flips approved
// submissions to 'published' once their file actually appears live.
//
// Runs lazily when the admin queue, /me, or the directory renders —
// KV-throttled so it fires at most once a minute. Any failure is swallowed:
// reconciliation must never break a page render, and the log is already
// live in git regardless of the mirror's freshness.

import { cascadeRank } from './ranks.ts';
import { slugify } from './facets.ts';
import { cleanMount } from './mounts.ts';

type Env = { DB: D1Database; RATE: KVNamespace };

type LogsJsonEntry = {
  url: string;
  title: string;
  date: string;
  rider: string;
  mount?: string;
  task: string;
  outcome: string;
  burns: unknown[];
};

const THROTTLE_KEY = 'reconcile:last';
const THROTTLE_SECONDS = 60;
// An approved edit's rebuild takes ~2 minutes to land in /logs.json; inside
// this window the mount backfill below leaves the edit's fresh mount alone.
const RECENT_EDIT_MS = 5 * 60_000;

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

    // Resolve handles → rider ids. D1 caps bound parameters per query, so
    // chunk rather than build one unbounded IN (...) as the site grows.
    const handles = [...new Set(logs.map((l) => l.rider).filter(Boolean))];
    const handleToId = new Map<string, string>();
    const CHUNK = 80;
    for (let i = 0; i < handles.length; i += CHUNK) {
      const batch = handles.slice(i, i + CHUNK);
      const placeholders = batch.map(() => '?').join(',');
      const rows = await env.DB.prepare(
        `SELECT id, handle FROM riders WHERE handle IN (${placeholders})`,
      )
        .bind(...batch)
        .all<{ id: string; handle: string }>();
      for (const r of rows.results ?? []) handleToId.set(r.handle, r.id);
    }

    // Which approved submissions can now flip to published (their slug is live).
    const liveSlugs = new Set(logs.map((l) => slugFromUrl(l.url)).filter(Boolean) as string[]);
    const approved = await env.DB.prepare(
      "SELECT id, slug, rider_id, kind FROM submissions WHERE status = 'approved'",
    ).all<{ id: string; slug: string; rider_id: string; kind: string }>();
    const slugToSubmission = new Map<string, { id: string; rider_id: string; kind: string }>();
    for (const s of approved.results ?? []) {
      if (liveSlugs.has(s.slug)) {
        slugToSubmission.set(s.slug, { id: s.id, rider_id: s.rider_id, kind: s.kind });
      }
    }

    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];
    const ridersToRank = new Set<string>();
    let published = 0;

    for (const log of logs) {
      const slug = slugFromUrl(log.url);
      if (!slug) continue;
      const submission = slugToSubmission.get(slug);
      const riderId = submission?.rider_id ?? handleToId.get(log.rider) ?? null;

      // For an EDIT being flipped this pass, /logs.json still carries the OLD
      // content (the ~2-min rebuild hasn't landed), while approve already
      // wrote the fresh values optimistically — so don't overwrite them from
      // stale /logs.json. A later reconcile, after the rebuild, upserts the
      // now-fresh values (the submission is 'published' by then, not here).
      const skipMirrorWrite = submission?.kind === 'edit';
      if (!skipMirrorWrite) {
        statements.push(
          env.DB.prepare(
            `INSERT INTO published_logs
               (slug, rider_id, title, date, task, outcome, burns_count, submission_id, published_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(slug) DO UPDATE SET
               -- An owner, once set, is never reassigned from /logs.json: the
               -- frontmatter rider string is just a handle, and a handle can be
               -- claimed by anyone, so letting it overwrite would let a new
               -- account take over an existing log (edits, rank, Verified badge).
               rider_id = COALESCE(published_logs.rider_id, excluded.rider_id),
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
      }

      if (submission) {
        statements.push(
          env.DB.prepare(
            "UPDATE submissions SET status = 'published', published_at = ?, updated_at = ? WHERE id = ? AND status = 'approved'",
          ).bind(now, now, submission.id),
        );
        if (riderId) ridersToRank.add(riderId);
        published += 1;
      } else if (riderId && !skipMirrorWrite) {
        // Legacy/first-time mirror of an existing log — its author's count
        // may have changed, so recompute them too.
        ridersToRank.add(riderId);
      }
    }

    if (statements.length) await env.DB.batch(statements);

    // Mounts live in columns migration 0002 adds, so they ride a second batch
    // once the mirror has landed: the same UPDATE approve runs, for every log
    // /logs.json names a mount on. That makes it the backfill too — the first
    // reconcile after the migration stamps every log already in the record.
    // On a 0001 database the batch fails as a unit and the mirror above is
    // untouched. Edits being flipped this pass skip, for the reason the
    // mirror skips them: /logs.json still carries the old mount — and so do
    // edits published inside RECENT_EDIT_MS, which the next reconcile would
    // otherwise meet with the same stale /logs.json and put the old mount
    // back over the fresh one approve wrote. Slug from facets.ts, the
    // /logs/mount/<slug>/ key.
    const recentEdits = new Set<string>();
    try {
      const since = new Date(Date.now() - RECENT_EDIT_MS).toISOString();
      const rows = await env.DB.prepare(
        "SELECT slug FROM submissions WHERE kind = 'edit' AND status = 'published' AND published_at > ?",
      )
        .bind(since)
        .all<{ slug: string }>();
      for (const r of rows.results ?? []) recentEdits.add(r.slug);
    } catch {
      /* the guard narrows a window; it never gates the backfill */
    }
    const mountUpdates: D1PreparedStatement[] = [];
    for (const log of logs) {
      const slug = slugFromUrl(log.url);
      if (!slug || slugToSubmission.get(slug)?.kind === 'edit' || recentEdits.has(slug)) continue;
      const mount = cleanMount(log.mount);
      const mountSlug = slugify(mount);
      if (!mountSlug) continue;
      mountUpdates.push(
        env.DB.prepare('UPDATE published_logs SET mount = ?, mount_slug = ? WHERE slug = ?').bind(mount, mountSlug, slug),
      );
    }
    if (mountUpdates.length) {
      try {
        await env.DB.batch(mountUpdates);
      } catch {
        /* pre-0002: the first reconcile after the migration backfills */
      }
    }

    // Published flight counts just changed — recompute affected riders'
    // ranks (first flight → Fledgling, 20th → Rider if vouched), rippling to
    // their vouchees. Best-effort; a later reconcile retries.
    if (ridersToRank.size) {
      try {
        await cascadeRank(env.DB, [...ridersToRank], 'system', 'reconcile_published');
      } catch {
        /* a later reconcile retries */
      }
    }

    return { ran: true, published, mirrored: logs.length };
  } catch {
    return { ran: false, published: 0, mirrored: 0 };
  }
}
