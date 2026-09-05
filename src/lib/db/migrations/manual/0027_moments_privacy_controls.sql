-- Privacy controls for anonymous Event Moments uploads.
ALTER TABLE event_photos
  ADD COLUMN IF NOT EXISTS upload_consent_at timestamp,
  ADD COLUMN IF NOT EXISTS upload_consent_version text,
  ADD COLUMN IF NOT EXISTS uploader_ip_hash text,
  ADD COLUMN IF NOT EXISTS reported_at timestamp,
  ADD COLUMN IF NOT EXISTS report_reason text;

-- Family-safe behavior is the default. Existing galleries also move to the
-- moderation queue so a previously created child-event gallery is not left
-- public by inertia.
ALTER TABLE event_plans
  ALTER COLUMN moments_require_approval SET DEFAULT true;

UPDATE event_plans
SET moments_require_approval = true,
    updated_at = now()
WHERE moments_enabled = true
  AND moments_require_approval = false;
