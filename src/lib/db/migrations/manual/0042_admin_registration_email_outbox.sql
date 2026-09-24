-- Administrator registration emails share the transaction of the in-app event.
-- No email address or contract contents are duplicated in this queue.
BEGIN;
CREATE TABLE IF NOT EXISTS public.admin_registration_email_outbox (
  notification_id integer PRIMARY KEY REFERENCES public.notifications(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','cancelled','dead_letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  first_attempt_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_registration_email_due_idx
  ON public.admin_registration_email_outbox(next_attempt_at, notification_id) WHERE status = 'pending';
ALTER TABLE public.admin_registration_email_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_registration_email_outbox FROM PUBLIC, anon, authenticated;
DO $$
DECLARE inherited_role record;
BEGIN
  FOR inherited_role IN
    SELECT DISTINCT r.rolname FROM pg_roles r
    WHERE r.rolname NOT IN ('anon', 'authenticated')
      AND (pg_has_role('anon', r.oid, 'USAGE') OR pg_has_role('authenticated', r.oid, 'USAGE'))
  LOOP
    EXECUTE format('REVOKE ALL ON public.admin_registration_email_outbox FROM %I', inherited_role.rolname);
  END LOOP;
  IF has_table_privilege('anon', 'public.admin_registration_email_outbox', 'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('authenticated', 'public.admin_registration_email_outbox', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'Browser role still has access to registration email outbox';
  END IF;
END $$;
COMMIT;
