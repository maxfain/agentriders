-- 0002: mounts named on published flights, rides (declared mounts), GitHub login.
-- Apply: npx wrangler d1 migrations apply agentriders --remote
ALTER TABLE published_logs ADD COLUMN mount TEXT;
ALTER TABLE published_logs ADD COLUMN mount_slug TEXT;   -- slugify(mount) from src/lib/facets.ts (the /logs/mount/<value>/ key)
CREATE INDEX idx_published_mount ON published_logs(mount_slug);

CREATE TABLE rider_mounts (                               -- rides: declared; never counted, never read by ranks.ts, never written from /start
  rider_id   TEXT NOT NULL REFERENCES riders(id),
  mount_slug TEXT NOT NULL,
  mount      TEXT NOT NULL,                               -- catalogue name, or validated free text (≤40) as typed
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (rider_id, mount_slug)
);
CREATE INDEX idx_rider_mounts_slug ON rider_mounts(mount_slug);

ALTER TABLE riders ADD COLUMN github_login TEXT;          -- captured at OAuth sign-in, re-stamped each GitHub sign-in
ALTER TABLE riders ADD COLUMN github_login_at TEXT;
ALTER TABLE riders ADD COLUMN github_public INTEGER NOT NULL DEFAULT 1;   -- opt-out (Max's call)
