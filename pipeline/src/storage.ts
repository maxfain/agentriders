// Supabase Storage uploads over plain HTTP with the service key. One public
// bucket ("cards") holds OG images at predictable paths:
//   flights/{owner}/{repo}/{number}.png   riders/{handle}.png

import { optional, required } from './env.ts';

function baseUrl(): string {
  return required('SUPABASE_URL').replace(/\/$/, '');
}

function headers(): Record<string, string> {
  const key = required('SUPABASE_SERVICE_KEY');
  return { Authorization: `Bearer ${key}`, apikey: key };
}

export const CARDS_BUCKET = optional('SUPABASE_CARDS_BUCKET', 'cards');

export async function ensureBucket(): Promise<void> {
  const res = await fetch(`${baseUrl()}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: CARDS_BUCKET, name: CARDS_BUCKET, public: true }),
  });
  // 409 = already exists; anything else unexpected is a real failure.
  if (!res.ok && res.status !== 409) {
    const body = await res.text();
    if (!body.includes('already exists')) throw new Error(`bucket create failed: ${res.status} ${body}`);
  }
}

export async function uploadPng(path: string, png: Buffer): Promise<void> {
  const res = await fetch(`${baseUrl()}/storage/v1/object/${CARDS_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      ...headers(),
      'Content-Type': 'image/png',
      'x-upsert': 'true',
      'Cache-Control': 'public, max-age=86400',
    },
    body: new Uint8Array(png),
  });
  if (!res.ok) throw new Error(`upload ${path} failed: ${res.status} ${await res.text()}`);
}

/** Public URL of an uploaded card (same construction the site uses). */
export function cardUrl(path: string): string {
  return `${baseUrl()}/storage/v1/object/public/${CARDS_BUCKET}/${path}`;
}
