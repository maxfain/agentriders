import { LIVE_STATUSES } from './submissions.ts';

// Onboarding progress, derived — never stored. /start and /me both read the
// same five counts from D1 on every load, so the surfaced state can't drift
// from the record. `pending` extends the old /me counts query with a subquery
// over submissions in a live status (the "flight in review" signal); every
// other count is the one /me already computed.
//
// Erasable TypeScript — the only runtime import is LIVE_STATUSES, so the
// "in review" set stays in lockstep with the submission state machine
// (src/lib/submissions.ts) instead of being re-spelled here.

export type OnboardingCounts = {
  flights: number; // published_logs for this rider
  verified: number; // flight_records with a matched_log_slug
  vouches: number; // active vouches received
  devices: number; // devices not revoked  → "agent paired"
  pending: number; // submissions in a live status → "flight in review"
};

export type OnboardingStep = 'not-paired' | 'paired-no-flight' | 'flight-in-review' | 'published';

export async function onboardingCounts(db: D1Database, riderId: string): Promise<OnboardingCounts> {
  // ?1 is the rider id, reused across every subquery; the live statuses bind
  // as ?2… so the pending set follows LIVE_STATUSES without hardcoding.
  const live = LIVE_STATUSES.map((_, i) => `?${i + 2}`).join(',');
  const row = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM published_logs WHERE rider_id = ?1) AS flights,
         (SELECT COUNT(*) FROM flight_records fr WHERE fr.rider_id = ?1 AND fr.matched_log_slug IS NOT NULL) AS verified,
         (SELECT COUNT(*) FROM vouches WHERE vouchee_id = ?1 AND status = 'active') AS vouches,
         (SELECT COUNT(*) FROM devices WHERE rider_id = ?1 AND revoked_at IS NULL) AS devices,
         (SELECT COUNT(*) FROM submissions
            WHERE rider_id = ?1
              AND status IN (${live})) AS pending`,
    )
    .bind(riderId, ...LIVE_STATUSES)
    .first<OnboardingCounts>();
  return {
    flights: row?.flights ?? 0,
    verified: row?.verified ?? 0,
    vouches: row?.vouches ?? 0,
    devices: row?.devices ?? 0,
    pending: row?.pending ?? 0,
  };
}

/**
 * Collapse the counts to a single spine state. Precedence is highest-first: a
 * published flight means onboarding is done no matter what else is in flight;
 * a live submission means the first flight is in review; a linked device means
 * the agent is paired and ready to file. Vouches and `verified` never gate the
 * spine — `verified` is an overlay on the published state.
 */
export function onboardingStep(c: OnboardingCounts): OnboardingStep {
  if (c.flights >= 1) return 'published';
  if (c.pending >= 1) return 'flight-in-review';
  if (c.devices >= 1) return 'paired-no-flight';
  return 'not-paired';
}

// The rail: the same counts, re-read as four numbered steps for the /start
// rail and the narrow strip. Only the rider's hands are on the clock —
// handle 1 · agent 3 · first flight 1 — and the flight joins it only once a
// device is paired, because it needs a real session the agent flies. The
// profile step is optional: never current, never on the clock, so it can't
// hold "You're flying." hostage. A by-hand flight (filed with no device) is a
// real flight but not a signed one: step 3 shows hollow, step 2 stays current,
// and the time line turns into a sentence instead of a number.

export type FlightDone = 'agent' | 'hand' | false;
export type RailStepId = 'handle' | 'agent' | 'flight' | 'profile';
export type RailStep = {
  id: RailStepId;
  n: 1 | 2 | 3 | 4;
  name: string;
  minutes: number;
  required: boolean;
  done: boolean | 'hand';
};
export type Rail = {
  steps: RailStep[];
  current: Exclude<RailStepId, 'profile'> | null;
  flight: FlightDone;
  requiredDone: boolean;
  minutesLeft: number;
  label: string;
  footnote: string | null;
};
export type RailInput = {
  handleClaimed: boolean;
  devices: number;
  pending: number;
  flights: number;
  profileDone: boolean;
};

export const ONBOARDING_STEPS: Omit<RailStep, 'done'>[] = [
  { id: 'handle', n: 1, name: 'Claim your handle', minutes: 1, required: true },
  { id: 'agent', n: 2, name: 'Enable your agent', minutes: 3, required: true },
  { id: 'flight', n: 3, name: 'First flight', minutes: 1, required: true },
  { id: 'profile', n: 4, name: 'Your profile', minutes: 1, required: false },
];

export const RAIL_BY_HAND_LABEL = 'Flying by hand — pair your agent and the next flight is signed.';
export const RAIL_DONE_LABEL = 'Done.';
export const RAIL_FOOTNOTE = "Your agent's part isn't on the clock.";

export function onboardingRail(i: RailInput): Rail {
  const agentDone = i.devices >= 1;
  const flight: FlightDone = i.pending >= 1 || i.flights >= 1 ? (agentDone ? 'agent' : 'hand') : false;
  const done: Record<RailStepId, boolean | 'hand'> = {
    handle: i.handleClaimed,
    agent: agentDone,
    flight: flight === 'agent' ? true : flight === 'hand' ? 'hand' : false,
    profile: i.profileDone,
  };
  const steps: RailStep[] = ONBOARDING_STEPS.map((s) => ({ ...s, done: done[s.id] }));

  const requiredDone = i.handleClaimed && agentDone && flight !== false;
  // First required step not done; 'hand' is not false, so a by-hand flight
  // never makes step 3 current — step 2 is, until a device is paired.
  const next = steps.find((s) => s.required && s.done === false);
  const current = next && next.id !== 'profile' ? next.id : null;

  const minutesLeft = steps.reduce((m, s) => {
    if (!s.required || s.done !== false) return m;
    if (s.id === 'flight' && !agentDone) return m; // needs a paired agent before it needs the rider
    return m + s.minutes;
  }, 0);

  const byHand = flight === 'hand';
  const label = byHand ? RAIL_BY_HAND_LABEL : requiredDone ? RAIL_DONE_LABEL : `about ${minutesLeft} min of yours`;
  const footnote = byHand || requiredDone ? null : RAIL_FOOTNOTE;
  return { steps, current, flight, requiredDone, minutesLeft, label, footnote };
}
