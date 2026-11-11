// PostHog product analytics, active only when PUBLIC_POSTHOG_KEY is set at
// build time (Cloudflare Pages → Settings → Variables and Secrets; it is a
// publishable key, not a secret). Base.astro's window.arTrack helper sends
// every funnel event to GA4 and mirrors it into window.__arQ; this module
// drains that queue into PostHog, so the events pages already fire
// (join_view, handle_claimed, log_submitted, …) reach both destinations and
// no page has to know PostHog exists. posthog-js is imported dynamically so
// a build without the key ships no analytics bundle and fetches nothing.

type QueuedEvent = [string, Record<string, unknown>?];

declare global {
  interface Window {
    __arQ?: QueuedEvent[];
  }
}

const key = import.meta.env.PUBLIC_POSTHOG_KEY?.trim();

if (key) {
  const host = import.meta.env.PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com';
  const { default: posthog } = await import('posthog-js');

  posthog.init(key, {
    api_host: host,
    defaults: '2025-05-24',
    // The posture /privacy documents: pageviews plus the deliberate funnel
    // events only — no autocapture, and never session recording.
    autocapture: false,
    disable_session_recording: true,
    person_profiles: 'identified_only',
  });

  // Signed-in rider on server-rendered pages (/me, /start, /logs/new, …):
  // Base.astro stamps the handle on <body>. Identify merges the anonymous
  // history into the person; signing out resets to a fresh anonymous id so
  // a shared browser doesn't keep attributing events to the rider.
  const handle = document.body.dataset.rider;
  if (handle) posthog.identify(handle);
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (
      form instanceof HTMLFormElement &&
      new URL(form.action, location.href).pathname === '/api/auth/logout'
    ) {
      posthog.reset();
    }
  });

  // Drain events fired before this module finished loading, then capture
  // live by replacing the queue's push. transport_type is a GA transport
  // hint (scripts/track.ts `beacon`), not an event property; PostHog handles
  // unload flushing itself.
  const send = ([name, params]: QueuedEvent) => {
    const { transport_type: _discard, ...props } = params ?? {};
    posthog.capture(name, props);
  };
  const queue = (window.__arQ = window.__arQ ?? []);
  for (const item of queue.splice(0)) send(item);
  queue.push = (...items: QueuedEvent[]) => {
    items.forEach(send);
    return queue.length;
  };
}

export {};
