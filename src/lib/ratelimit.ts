// Fixed-window rate limiting on KV TTL counters. KV writes are not atomic,
// so a burst can slightly overshoot the limit — acceptable for abuse
// damping (the real guarantees live in D1 constraints).
// Erasable TypeScript — imported directly by node --test with a fake KV.

type KVLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

/**
 * Returns true when the caller is within `max` events per `windowSecs`
 * for `key`, and records this event. KV requires expirationTtl >= 60.
 */
export async function rateLimit(
  kv: KVLike,
  key: string,
  max: number,
  windowSecs: number,
): Promise<boolean> {
  const fullKey = `rl:${key}`;
  const current = Number((await kv.get(fullKey)) ?? '0');
  if (current >= max) return false;
  // Re-putting resets the TTL, stretching the window under sustained
  // traffic — stricter than a fixed window, never looser.
  await kv.put(fullKey, String(current + 1), { expirationTtl: Math.max(60, windowSecs) });
  return true;
}
