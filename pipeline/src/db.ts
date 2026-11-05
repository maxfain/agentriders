// One thin interface over two drivers: postgres.js against the real database
// (DATABASE_URL=postgres://…) and PGlite for tests (DATABASE_URL=pglite://
// or a PGlite instance passed directly). Parameterized text queries only —
// no ORM, no query builder — so every statement is readable in place.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export type Db = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  end(): Promise<void>;
};

export async function connect(url = process.env.DATABASE_URL ?? ''): Promise<Db> {
  if (!url) throw new Error('DATABASE_URL is not set');
  if (url.startsWith('pglite://')) {
    const { PGlite } = await import('@electric-sql/pglite');
    const target = url.slice('pglite://'.length);
    const pg = new PGlite(target === 'memory' || target === '' ? undefined : target);
    return wrapPglite(pg);
  }
  const { default: postgres } = await import('postgres');
  // Supabase poolers and direct connections both work; keep the pool tiny —
  // the pipeline is a batch client, not a server. We ask for a 10-minute
  // statement_timeout as a startup parameter: a direct connection honors it,
  // but Supabase's transaction pooler silently drops per-connection startup
  // parameters, so through the pooler the 2-minute database default stands.
  // The publish job therefore does NOT depend on this ceiling — it refreshes
  // the corpus matviews one statement at a time (refreshCorpusViews in
  // jobs/publish.ts) so no single statement approaches the default. The option
  // stays as best-effort headroom for direct connections.
  const sql = postgres(url, { max: 4, prepare: false, connection: { statement_timeout: '600000' } });
  return {
    async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
      const rows = await sql.unsafe(text, params as never[]);
      return rows as unknown as T[];
    },
    async end() {
      await sql.end({ timeout: 5 });
    },
  };
}

/** Wrap an existing PGlite instance (tests construct their own). */
export function wrapPglite(pg: {
  query: (q: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  exec: (q: string) => Promise<{ rows: unknown[] }[]>;
  close: () => Promise<void>;
}): Db {
  return {
    async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
      // PGlite's extended-protocol query() takes exactly one statement;
      // parameterless multi-statement SQL (migrations) goes through exec().
      if (params.length === 0) {
        const results = await pg.exec(text);
        return (results.at(-1)?.rows ?? []) as T[];
      }
      const res = await pg.query(text, params);
      return res.rows as T[];
    },
    async end() {
      await pg.close();
    },
  };
}

/**
 * Multi-row INSERT in batches. `conflict` is the full ON CONFLICT clause
 * ("on conflict (x) do nothing" / "… do update set …"). Returns rows written
 * (as reported by RETURNING 1 when `returning` is true, else rows attempted).
 */
export async function insertBatch(
  db: Db,
  table: string,
  columns: string[],
  rows: unknown[][],
  conflict = '',
  batchSize = 500,
): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const params: unknown[] = [];
    const tuples = batch
      .map((row) => {
        const placeholders = row.map((v) => {
          params.push(v);
          return `$${params.length}`;
        });
        return `(${placeholders.join(',')})`;
      })
      .join(',');
    const text = `insert into ${table} (${columns.join(',')}) values ${tuples} ${conflict} returning 1`;
    const out = await db.query(text, params);
    written += out.length;
  }
  return written;
}

/** Apply pipeline/migrations/*.sql in filename order (idempotent files). */
export async function migrate(db: Db, dir: string): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = await readFile(join(dir, f), 'utf8');
    await db.query(sql);
  }
  return files;
}
