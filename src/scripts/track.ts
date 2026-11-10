// Funnel events (docs/seo-aeo-plan.md §7) keep their existing analytics
// contract while also reaching the PostHog client initialized in Base.astro.
// Either client may be unavailable (for example, blocked by the browser), so
// tracking must never interrupt the user action that prompted it.
type Tracker = (name: string, params?: Record<string, unknown>) => void;
type PostHogTracker = { capture: Tracker };

export function track(name: string, params?: Record<string, unknown>): void {
  const clients = window as Window & { arTrack?: Tracker; posthog?: PostHogTracker };
  if (typeof clients.arTrack === 'function') clients.arTrack(name, params);
  if (typeof clients.posthog?.capture === 'function') clients.posthog.capture(name, params);
}

// For an event fired right before the page navigates away (a claim, a
// submit): beacon transport survives the unload.
export const beacon = { transport_type: 'beacon' } as const;
