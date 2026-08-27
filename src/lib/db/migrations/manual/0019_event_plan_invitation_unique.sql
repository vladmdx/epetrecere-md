-- A plan owns exactly one invitation, and an invitation belongs to exactly
-- one plan. The application already assumes this — POST /api/invitations
-- takes its "reuse" branch on the strength of event_plans.invitation_id and
-- writes the caller's content onto whatever it finds. If two plans ever came
-- to share one invitation, a Send from the second would rewrite the first
-- one's date, location and event type underneath guests who already hold
-- RSVP links to it, and no code path would report anything wrong.
--
-- 0018 backfilled the column heuristically from a non-unique title match, so
-- the invariant needs to be held by the database rather than by the care of
-- whoever writes the next query. Partial, because an unlinked plan is the
-- normal state and NULLs must stay free to repeat.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_event_plans_invitation_id"
  ON "event_plans" ("invitation_id")
  WHERE "invitation_id" IS NOT NULL;
