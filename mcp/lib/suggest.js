// Turn a signed telemetry payload into the frontmatter fields it can ground.
// Presentation only — the server never trusts these; they fill the draft so
// the agent doesn't restate what the session already proves.

export function humanDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  if (m) return `${m}m`;
  return `${s}s`;
}

/**
 * From a buildRecord() payload, the frontmatter fields telemetry can fill and
 * which are therefore "verified": duration, model, harness, date.
 */
export function suggestFromPayload(payload) {
  return {
    duration: humanDuration(payload.duration_seconds),
    model: Array.isArray(payload.models) && payload.models.length ? payload.models.join(', ') : undefined,
    harness: 'Claude Code',
    date: typeof payload.started_at === 'string' ? payload.started_at.slice(0, 10) : undefined,
  };
}
