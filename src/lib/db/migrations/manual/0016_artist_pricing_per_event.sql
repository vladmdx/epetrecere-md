-- Per-event and per-category artist pricing.
--
-- Artists told us their real pricing is not "N hours × a rate" — a
-- photographer charges one figure for a wedding and another for a
-- christening, each covering a typical event length. Two columns carry that:
--
--   pricing_mode  'per_hour' (the existing duration tiers) or 'per_event'
--                 (a fixed price covering an average duration).
--   event_type    NULL = applies to every event type, which is what every
--                 existing row means. Otherwise a canonical key from
--                 src/lib/events/normalize.ts (wedding, baptism, cumatrie,
--                 corporate, birthday, concert, other).
--
-- Deliberately NOT a new `scope` value: scope drives the weekend/evening
-- override resolver, which treats an unknown scope as unmatchable, so a
-- 'per_event' scope would have been counted everywhere and matched nowhere.

ALTER TABLE "artist_packages"
  ADD COLUMN IF NOT EXISTS "pricing_mode" text NOT NULL DEFAULT 'per_hour';

ALTER TABLE "artist_packages"
  ADD COLUMN IF NOT EXISTS "event_type" text;

-- The resolver reads an artist's whole tier list at once, then filters in
-- memory; this index keeps that read cheap as artists add per-event rows.
CREATE INDEX IF NOT EXISTS "idx_artist_packages_artist_mode"
  ON "artist_packages" ("artist_id", "pricing_mode");
