-- Per-guest invitation delivery tracking + one invitation per event plan.
--
-- The bug: "I send to one guest today, add another tomorrow and send —
-- yesterday's guest gets it again." Two separate causes, both here.
--
--   invitation_guests.invitation_sent_at
--     There was no record of who had been mailed, so the bulk send had
--     nothing to exclude on and re-mailed every guest with an address on
--     every press. The send route now filters on this and stamps it per
--     guest as each mail succeeds.
--
--   event_plans.invitation_id
--     Nothing linked a plan to its invitation, so the planner's Send
--     button POSTed a brand-new invitation (new slug, fresh RSVP tokens)
--     every time. Day two produced invitation #2 containing all N+1
--     guests: everyone got a duplicate mail pointing at a different link,
--     and day one's RSVPs stayed orphaned on invitation #1.
--
-- Both blocks below are guarded on the column not already existing, so
-- the file is safe to re-run — and, more importantly, so the one-time
-- backfills never fire a second time over rows added after this ran.

-- ── invitation_guests.invitation_sent_at ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invitation_guests'
      AND column_name = 'invitation_sent_at'
  ) THEN
    ALTER TABLE "invitation_guests"
      ADD COLUMN "invitation_sent_at" timestamptz;

    -- Backfill: every guest with an address on an already-published
    -- invitation has been mailed at least once (that is the bug — they
    -- were mailed on every press). Leaving them NULL would hand them one
    -- final duplicate on the next send. created_at is the closest
    -- timestamp we have; the exact value only feeds the "sent on" label.
    -- Drop this UPDATE if you would rather everyone got one more copy.
    UPDATE "invitation_guests" g
       SET "invitation_sent_at" = g."created_at"
      FROM "invitations" i
     WHERE i."id" = g."invitation_id"
       AND i."status" = 'published'
       AND g."email" IS NOT NULL;
  END IF;
END $$;

-- The send route reads "who on this invitation is still unsent" on every
-- press; this keeps that read cheap as a guest list grows.
CREATE INDEX IF NOT EXISTS "idx_invitation_guests_unsent"
  ON "invitation_guests" ("invitation_id", "invitation_sent_at");

-- ── event_plans.invitation_id ────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'event_plans'
      AND column_name = 'invitation_id'
  ) THEN
    ALTER TABLE "event_plans"
      ADD COLUMN "invitation_id" integer
      REFERENCES "invitations"("id") ON DELETE SET NULL;

    -- Backfill, HEURISTIC — review before running on prod.
    -- Existing plans have no recorded link, so without this their next
    -- Send mints one more invitation and mails everybody one more time
    -- before the plan is finally linked. The planner pre-fills the
    -- invitation's couple_names from the plan title, so an exact title
    -- match on the same owner identifies it in every case where the host
    -- didn't edit that field. Newest match wins, since repeated presses
    -- left a trail of duplicates and the last one holds every guest.
    -- If you'd rather not guess, delete this UPDATE: the only cost is
    -- one more duplicate wave per existing plan.
    UPDATE "event_plans" p
       SET "invitation_id" = (
         SELECT i."id"
           FROM "invitations" i
          WHERE i."user_id" = p."user_id"
            AND i."couple_names" = p."title"
          ORDER BY i."created_at" DESC
          LIMIT 1
       );
  END IF;
END $$;
