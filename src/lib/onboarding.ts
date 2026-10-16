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
