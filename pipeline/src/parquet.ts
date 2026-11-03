// Thin wrappers over hyparquet. AIDev files are snappy-compressed (built-in)
// single-row-group parquet; int64 columns arrive as BigInt. The full 933k-row
// body column reads in one pass at ~1.4 GB RSS, so the backfill runs with
// --max-old-space-size=6144 (pipeline/README.md) rather than a streaming
// contortion here.

import { asyncBufferFromFile, parquetMetadataAsync, parquetReadObjects } from 'hyparquet';

export async function rowCount(path: string): Promise<number> {
  const file = await asyncBufferFromFile(path);
  const md = await parquetMetadataAsync(file);
  return Number(md.num_rows);
}

export async function readColumns<T = Record<string, unknown>>(
  path: string,
  columns: string[],
  range?: { rowStart?: number; rowEnd?: number },
): Promise<T[]> {
  const file = await asyncBufferFromFile(path);
  return (await parquetReadObjects({
    file,
    columns,
    rowStart: range?.rowStart,
    rowEnd: range?.rowEnd,
  })) as T[];
}

/** BigInt/number/string → number (GitHub ids are < 2^53). */
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'bigint' ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s.length > 0 ? s : null;
}

/** AIDev timestamps are ISO strings; empty/invalid → null. */
export function iso(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  return Number.isFinite(Date.parse(s)) ? s : null;
}
