ALTER TABLE invitation_guests
  ADD COLUMN IF NOT EXISTS dietary_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS rsvp_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS rsvp_token_revoked_at timestamptz;

UPDATE invitation_guests AS g
SET rsvp_token_expires_at = COALESCE(
  (SELECT (i.event_date::date + INTERVAL '14 days')::timestamptz
   FROM invitations AS i WHERE i.id = g.invitation_id),
  now() + INTERVAL '90 days'
)
WHERE g.rsvp_token_expires_at IS NULL;

CREATE INDEX IF NOT EXISTS invitation_guests_token_active_idx
  ON invitation_guests (rsvp_token)
  WHERE rsvp_token_revoked_at IS NULL;
