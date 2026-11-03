-- 0003: D1 mirror of each rider's claimed GitHub flights (the Flight Log
-- corpus lives in Supabase Postgres — docs/flight-log-corpus.md). Claimed
-- flights count toward rank thresholds alongside published logs; hidden
-- claims still count (hiding is presentation, not deletion). The mirror is
-- written by the claim APIs and resynced by /api/cron/flightlog, so
-- src/lib/ranks.ts stays a pure D1 reader.
-- Apply: npx wrangler d1 migrations apply agentriders --remote
CREATE TABLE rider_claimed_flights (
  rider_id   TEXT PRIMARY KEY REFERENCES riders(id),
  claimed    INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
