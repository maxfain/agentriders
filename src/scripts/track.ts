// GA4 funnel events (docs/seo-aeo-plan.md §7) go through the window.arTrack
// helper Base.astro defines after the gtag snippet. The guard keeps a page's
// own script working when that snippet is blocked or never ran.
type Tracker = (name: string, params?: Record<string, unknown>) => void;

export function track(name: string, params?: Record<string, unknown>): void {
  const fn = (window as Window & { arTrack?: Tracker }).arTrack;
  if (typeof fn === 'function') fn(name, params);
}

// For an event fired right before the page navigates away (a claim, a
// submit): beacon transport survives the unload.
export const beacon = { transport_type: 'beacon' } as const;
