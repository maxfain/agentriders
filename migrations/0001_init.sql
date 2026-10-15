-- Phase 2 foundations: the full schema from docs/phase2-plan.md.
-- Git stays canonical for published logs; these tables hold people and
-- process: accounts, sessions, the submission queue, vouches, CLI flight
-- records, and the rank audit trail.

CREATE TABLE riders (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  bio TEXT,
  rank TEXT CHECK (rank IN ('fledgling','rider','wingleader')),
  is_admin INTEGER NOT NULL DEFAULT 0,
  banned_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE identities (
  id TEXT PRIMARY KEY,
  rider_id TEXT NOT NULL REFERENCES riders(id),
  provider TEXT NOT NULL CHECK (provider IN ('github','email')),
  provider_id TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (provider, provider_id)
);
CREATE INDEX idx_identities_rider ON identities(rider_id);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  rider_id TEXT NOT NULL REFERENCES riders(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT
);
CREATE INDEX idx_sessions_rider ON sessions(rider_id);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE magic_link_tokens (
  token_hash TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE INDEX idx_magic_email ON magic_link_tokens(email, created_at);

CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  rider_id TEXT NOT NULL REFERENCES riders(id),
  kind TEXT NOT NULL DEFAULT 'new' CHECK (kind IN ('new','edit')),
  target_log_slug TEXT,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  frontmatter_json TEXT NOT NULL,
  body_md TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft','submitted','in_review','changes_requested','approved','published','rejected')),
  reviewer_notes TEXT,
  reviewed_by TEXT REFERENCES riders(id),
  commit_sha TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  submitted_at TEXT,
  published_at TEXT
);
CREATE INDEX idx_submissions_status ON submissions(status, submitted_at);
CREATE INDEX idx_submissions_rider ON submissions(rider_id, updated_at);
CREATE UNIQUE INDEX idx_submissions_slug_live ON submissions(slug)
  WHERE status IN ('submitted','in_review','changes_requested','approved');

CREATE TABLE published_logs (
  slug TEXT PRIMARY KEY,
  rider_id TEXT REFERENCES riders(id),
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  task TEXT NOT NULL,
  outcome TEXT NOT NULL,
  burns_count INTEGER NOT NULL DEFAULT 0,
  submission_id TEXT REFERENCES submissions(id),
  published_at TEXT NOT NULL
);
CREATE INDEX idx_published_rider ON published_logs(rider_id);

CREATE TABLE vouches (
  id TEXT PRIMARY KEY,
  voucher_id TEXT NOT NULL REFERENCES riders(id),
  vouchee_id TEXT NOT NULL REFERENCES riders(id),
  statement TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','removed')),
  created_at TEXT NOT NULL,
  UNIQUE (voucher_id, vouchee_id),
  CHECK (voucher_id <> vouchee_id)
);
CREATE INDEX idx_vouches_vouchee ON vouches(vouchee_id, status);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  rider_id TEXT NOT NULL REFERENCES riders(id),
  public_key TEXT NOT NULL,
  name TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX idx_devices_rider ON devices(rider_id);

CREATE TABLE device_link_codes (
  code_hash TEXT PRIMARY KEY,
  rider_id TEXT NOT NULL REFERENCES riders(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE TABLE flight_records (
  id TEXT PRIMARY KEY,
  rider_id TEXT NOT NULL REFERENCES riders(id),
  device_id TEXT NOT NULL REFERENCES devices(id),
  payload_json TEXT NOT NULL,
  signature TEXT NOT NULL,
  record_hash TEXT NOT NULL UNIQUE,
  cc_session_hash TEXT,
  evals_score REAL,
  matched_log_slug TEXT REFERENCES published_logs(slug),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_records_rider ON flight_records(rider_id);
CREATE UNIQUE INDEX idx_records_session ON flight_records(rider_id, cc_session_hash)
  WHERE cc_session_hash IS NOT NULL;
CREATE UNIQUE INDEX idx_records_match ON flight_records(matched_log_slug)
  WHERE matched_log_slug IS NOT NULL;

CREATE TABLE rank_events (
  id TEXT PRIMARY KEY,
  rider_id TEXT NOT NULL REFERENCES riders(id),
  old_rank TEXT,
  new_rank TEXT,
  reason TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_rank_events_rider ON rank_events(rider_id, created_at);

CREATE TABLE moderation_flags (
  id TEXT PRIMARY KEY,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('rider','submission','vouch','flight_record')),
  subject_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES riders(id),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution TEXT
);
