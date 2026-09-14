-- 0034 — Fail-closed Data API security for notifications and calendar events.
--
-- Both legacy public tables contain private user/partner data and are accessed
-- only by trusted server code. Remove direct and inherited browser-role ACLs,
-- enable RLS, preserve trusted server-owner access, and verify the effective
-- browser-role result before commit.
-- Transactional, idempotent and self-healing for ACL/RLS drift.
-- Do not apply to Preview/Production without an explicit rollout.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DO $$
DECLARE
  target_table text;
  relation_kind "char";
  serial_sequence regclass;
  serial_dependency_count integer;
  post0033_column_count integer;
  post0033_index_count integer;
  post0033_rls_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated')
    HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42704',
      MESSAGE = '0034 requires the Supabase anon and authenticated roles';
  END IF;

  -- Enforce migration ordering without trusting a same-name migration file.
  SELECT count(*)::integer
  INTO post0033_column_count
  FROM (VALUES
    ('booking_requests'::text, 'creation_scope_hash'::text, 'text'::text),
    ('booking_requests', 'creation_request_id', 'uuid'),
    ('booking_requests', 'creation_payload_hash', 'text'),
    ('offer_requests', 'booking_request_id', 'int4')
  ) AS expected(table_name, column_name, udt_name)
  JOIN information_schema.columns AS actual
    ON actual.table_schema = 'public'
   AND actual.table_name = expected.table_name
   AND actual.column_name = expected.column_name
   AND actual.udt_name = expected.udt_name
   AND actual.is_nullable = 'YES'
   AND actual.column_default IS NULL
   AND actual.is_identity = 'NO'
   AND actual.is_generated = 'NEVER';

  SELECT count(*)::integer
  INTO post0033_index_count
  FROM pg_class AS index_relation
  JOIN pg_namespace AS namespace
    ON namespace.oid = index_relation.relnamespace
  JOIN pg_index AS index_catalog
    ON index_catalog.indexrelid = index_relation.oid
  WHERE namespace.nspname = 'public'
    AND index_relation.relname IN (
      'booking_requests_creation_scope_request_uidx',
      'offer_requests_booking_request_uidx'
    )
    AND index_catalog.indisunique
    AND index_catalog.indisvalid
    AND index_catalog.indisready
    AND index_catalog.indislive;

  SELECT count(*)::integer
  INTO post0033_rls_count
  FROM pg_class AS relation
  WHERE relation.oid IN (
    'public.booking_requests'::regclass,
    'public.offer_requests'::regclass
  )
    AND relation.relrowsecurity
    AND NOT relation.relforcerowsecurity;

  IF post0033_column_count <> 4
    OR post0033_index_count <> 2
    OR post0033_rls_count <> 2
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0034 requires the canonical post-0033 database baseline',
      HINT = 'Apply and verify manual migration 0033 before migration 0034.';
  END IF;

  FOREACH target_table IN ARRAY ARRAY['notifications', 'calendar_events'] LOOP
    SELECT relation.relkind
    INTO relation_kind
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = target_table;

    IF relation_kind IS DISTINCT FROM 'r'::"char" THEN
      RAISE EXCEPTION USING
        ERRCODE = '42P01',
        MESSAGE = format(
          '0034 requires public.%I to be an ordinary table; relkind=%s',
          target_table,
          coalesce(relation_kind::text, '<missing>')
        );
    END IF;
  END LOOP;

  -- notifications.id is known to be serial. Refuse an ambiguous replacement
  -- instead of accidentally securing the wrong sequence.
  serial_sequence := pg_get_serial_sequence(
    'public.notifications',
    'id'
  )::regclass;
  IF serial_sequence IS DISTINCT FROM
      to_regclass('public.notifications_id_seq') THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format(
        '0034 requires notifications.id to own public.notifications_id_seq; found %s',
        coalesce(serial_sequence::text, '<none>')
      );
  END IF;

  SELECT count(*)::integer
  INTO serial_dependency_count
  FROM pg_depend AS dependency
  JOIN pg_attribute AS attribute
    ON attribute.attrelid = 'public.notifications'::regclass
   AND attribute.attname = 'id'
   AND attribute.attnum = dependency.refobjsubid
  WHERE dependency.classid = 'pg_class'::regclass
    AND dependency.objid = serial_sequence
    AND dependency.refclassid = 'pg_class'::regclass
    AND dependency.refobjid = 'public.notifications'::regclass
    AND dependency.deptype IN ('a', 'i');
  IF serial_dependency_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0034 found a non-canonical notifications serial dependency';
  END IF;

  -- calendar_events may use the canonical serial/identity sequence or no
  -- sequence. A renamed/foreign sequence is ambiguous and must not be skipped.
  serial_sequence := pg_get_serial_sequence(
    'public.calendar_events',
    'id'
  )::regclass;
  IF serial_sequence IS NOT NULL
    AND serial_sequence IS DISTINCT FROM
      to_regclass('public.calendar_events_id_seq')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format(
        '0034 found a non-canonical calendar_events.id sequence: %s',
        serial_sequence::text
      );
  END IF;
  IF serial_sequence IS NULL
    AND to_regclass('public.calendar_events_id_seq') IS NOT NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0034 found an unowned public.calendar_events_id_seq';
  END IF;
END $$;

-- Take final table locks in deterministic order. A busy rollout aborts on the
-- short lock timeout before any catalog change can commit.
LOCK TABLE public.calendar_events, public.notifications
  IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  target_table text;
  target_sequence text;
  target_role text;
  column_list text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['calendar_events', 'notifications'] LOOP
    SELECT string_agg(
      quote_ident(attribute.attname),
      ', ' ORDER BY attribute.attnum
    )
    INTO column_list
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = format('public.%I', target_table)::regclass
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped;

    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC',
      target_table
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC',
      column_list,
      target_table
    );

    -- Walk every role granted (directly or transitively) to a Data API browser
    -- role. Revoking only anon/authenticated is insufficient when they inherit
    -- an ACL from a parent role.
    FOR target_role IN
      WITH RECURSIVE browser_role_tree(role_oid, role_name) AS (
        SELECT role.oid, role.rolname
        FROM pg_roles AS role
        WHERE role.rolname IN ('anon', 'authenticated')
        UNION
        SELECT parent.oid, parent.rolname
        FROM browser_role_tree AS child
        JOIN pg_auth_members AS membership
          ON membership.member = child.role_oid
        JOIN pg_roles AS parent ON parent.oid = membership.roleid
      )
      SELECT DISTINCT role_name
      FROM browser_role_tree
      ORDER BY role_name
    LOOP
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I',
        target_table,
        target_role
      );
      EXECUTE format(
        'REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM %I',
        column_list,
        target_table,
        target_role
      );
    END LOOP;
  END LOOP;

  FOR target_sequence IN
    SELECT relation.relname
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'S'
      AND relation.relname IN (
        'calendar_events_id_seq',
        'notifications_id_seq'
      )
    ORDER BY relation.relname
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM PUBLIC',
      target_sequence
    );
    FOR target_role IN
      WITH RECURSIVE browser_role_tree(role_oid, role_name) AS (
        SELECT role.oid, role.rolname
        FROM pg_roles AS role
        WHERE role.rolname IN ('anon', 'authenticated')
        UNION
        SELECT parent.oid, parent.rolname
        FROM browser_role_tree AS child
        JOIN pg_auth_members AS membership
          ON membership.member = child.role_oid
        JOIN pg_roles AS parent ON parent.oid = membership.roleid
      )
      SELECT DISTINCT role_name
      FROM browser_role_tree
      ORDER BY role_name
    LOOP
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM %I',
        target_sequence,
        target_role
      );
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications NO FORCE ROW LEVEL SECURITY;

-- Prove the catalog flags and every effective browser-role privilege before
-- commit. Owner, superuser and predefined broad-role access cannot be repaired
-- by object-level REVOKE; those unsafe configurations abort transactionally.
DO $$
DECLARE
  target_table text;
  target_sequence text;
  browser_role text;
  column_name text;
  privilege_name text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class AS relation
    WHERE relation.oid IN (
      'public.calendar_events'::regclass,
      'public.notifications'::regclass
    )
      AND (NOT relation.relrowsecurity OR relation.relforcerowsecurity)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0034 failed to enable canonical owner-bypass RLS on every target table';
  END IF;

  FOR browser_role IN
    SELECT role.rolname
    FROM pg_roles AS role
    WHERE role.rolname IN ('anon', 'authenticated')
    ORDER BY role.rolname
  LOOP
    FOREACH target_table IN ARRAY ARRAY['calendar_events', 'notifications'] LOOP
      FOREACH privilege_name IN ARRAY ARRAY[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
        'REFERENCES', 'TRIGGER'
      ] LOOP
        IF has_table_privilege(
          browser_role,
          format('public.%I', target_table),
          privilege_name
        ) THEN
          RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = format(
              '0034 could not remove effective %s %s privilege from public.%s',
              browser_role,
              privilege_name,
              target_table
            ),
            HINT = 'Remove unsafe ownership, superuser, BYPASSRLS or predefined broad-role membership, then retry.';
        END IF;
      END LOOP;

      FOR column_name IN
        SELECT attribute.attname
        FROM pg_attribute AS attribute
        WHERE attribute.attrelid = format(
          'public.%I',
          target_table
        )::regclass
          AND attribute.attnum > 0
          AND NOT attribute.attisdropped
      LOOP
        FOREACH privilege_name IN ARRAY ARRAY[
          'SELECT', 'INSERT', 'UPDATE', 'REFERENCES'
        ] LOOP
          IF has_column_privilege(
            browser_role,
            format('public.%I', target_table),
            column_name,
            privilege_name
          ) THEN
            RAISE EXCEPTION USING
              ERRCODE = '42501',
              MESSAGE = format(
                '0034 could not remove effective %s %s privilege from public.%s.%s',
                browser_role,
                privilege_name,
                target_table,
                column_name
              ),
              HINT = 'Remove unsafe ownership, superuser, BYPASSRLS or predefined broad-role membership, then retry.';
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;

    FOR target_sequence IN
      SELECT relation.relname
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relkind = 'S'
        AND relation.relname IN (
          'calendar_events_id_seq',
          'notifications_id_seq'
        )
      ORDER BY relation.relname
    LOOP
      FOREACH privilege_name IN ARRAY ARRAY['USAGE', 'SELECT', 'UPDATE'] LOOP
        IF has_sequence_privilege(
          browser_role,
          format('public.%I', target_sequence),
          privilege_name
        ) THEN
          RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = format(
              '0034 could not remove effective %s %s privilege from public.%s',
              browser_role,
              privilege_name,
              target_sequence
            ),
            HINT = 'Remove unsafe ownership, superuser, BYPASSRLS or predefined broad-role membership, then retry.';
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

COMMENT ON TABLE public.notifications IS
  'Private server-managed notifications; RLS with trusted owner bypass and no Data API browser-role grants (0034).';
COMMENT ON TABLE public.calendar_events IS
  'Private server-managed availability data; RLS with trusted owner bypass and no Data API browser-role grants (0034).';

COMMIT;
