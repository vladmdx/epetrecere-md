-- 0035 — Durable Clerk identity deletion + permanent erasure tombstones.
--
-- A local account erasure must survive a failed Clerk API call. The raw Clerk
-- id is retained only while the external deletion is retryable; a keyed HMAC
-- remains afterwards solely to reject late create/update webhooks.
-- Transactional, idempotent, and fail-closed for Supabase Data API access.
-- Do not apply to Preview/Production without an explicit rollout.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated')
    HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42704',
      MESSAGE = '0035 requires the Supabase anon and authenticated roles';
  END IF;

  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42P01',
      MESSAGE = '0035 requires public.users';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.account_erasure_identity_outbox (
  identity_hash text PRIMARY KEY,
  clerk_id text,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_erasure_identity_hash_chk
    CHECK (identity_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT account_erasure_identity_attempts_chk CHECK (attempts >= 0),
  CONSTRAINT account_erasure_identity_state_chk CHECK (
    (status = 'processing' AND clerk_id IS NOT NULL
      AND lease_token IS NOT NULL AND lease_until IS NOT NULL
      AND completed_at IS NULL)
    OR (status IN ('pending', 'failed') AND clerk_id IS NOT NULL
      AND lease_token IS NULL AND lease_until IS NULL
      AND completed_at IS NULL)
    OR (status = 'completed' AND clerk_id IS NULL
      AND lease_token IS NULL AND lease_until IS NULL
      AND completed_at IS NOT NULL)
  )
);

-- Freeze the target before catalog validation so a concurrent DDL statement
-- cannot swap in column/constraint/index drift between inspection and repair.
LOCK TABLE public.account_erasure_identity_outbox IN ACCESS EXCLUSIVE MODE;

-- Refuse a pre-existing lookalike rather than silently trusting incompatible
-- columns. A failed migration rolls every change back.
DO $$
DECLARE
  expected_columns text[] := ARRAY[
    'attempts:integer:NO',
    'clerk_id:text:YES',
    'completed_at:timestamp with time zone:YES',
    'created_at:timestamp with time zone:NO',
    'identity_hash:text:NO',
    'last_error:text:YES',
    'lease_token:uuid:YES',
    'lease_until:timestamp with time zone:YES',
    'next_attempt_at:timestamp with time zone:NO',
    'status:text:NO',
    'updated_at:timestamp with time zone:NO'
  ];
  actual_columns text[];
BEGIN
  SELECT array_agg(
    column_name || ':' || data_type || ':' || is_nullable
    ORDER BY column_name
  )
  INTO actual_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'account_erasure_identity_outbox';

  IF actual_columns IS DISTINCT FROM expected_columns THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format(
        '0035 found an incompatible account_erasure_identity_outbox shape: %s',
        coalesce(actual_columns::text, '<missing>')
      );
  END IF;
END $$;

DO $$
DECLARE
  relation_kind "char";
  relation_persistence "char";
  relation_is_partition boolean;
  relation_owner oid;
  primary_columns text[];
  primary_count integer;
BEGIN
  SELECT relkind, relpersistence, relispartition, relowner
  INTO relation_kind, relation_persistence, relation_is_partition,
    relation_owner
  FROM pg_class
  WHERE oid = 'public.account_erasure_identity_outbox'::regclass;
  IF relation_kind IS DISTINCT FROM 'r'::"char"
      OR relation_persistence IS DISTINCT FROM 'p'::"char"
      OR relation_is_partition IS DISTINCT FROM false
      OR relation_owner IS DISTINCT FROM (SELECT oid FROM pg_roles
        WHERE rolname = current_user)
      OR EXISTS (
        SELECT 1 FROM pg_inherits
        WHERE inhrelid = 'public.account_erasure_identity_outbox'::regclass
           OR inhparent = 'public.account_erasure_identity_outbox'::regclass
      ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42809',
      MESSAGE = format(
        '0035 requires a current-user-owned permanent non-partitioned non-inherited ordinary tombstone table; relkind=%s persistence=%s partition=%s',
        coalesce(relation_kind::text, '<missing>'),
        coalesce(relation_persistence::text, '<missing>'),
        coalesce(relation_is_partition::text, '<missing>')
      );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid =
        'public.account_erasure_identity_outbox'::regclass
      AND attribute.attnum > 0
      AND (
        attribute.attisdropped
        OR attribute.attidentity <> ''
        OR attribute.attgenerated <> ''
        OR attribute.atttypmod <> -1
        OR attribute.attinhcount <> 0
        OR NOT attribute.attislocal
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0035 refuses dropped/identity/generated/typmod/inherited tombstone column drift';
  END IF;

  SELECT count(*)::integer
  INTO primary_count
  FROM pg_constraint
  WHERE conrelid = 'public.account_erasure_identity_outbox'::regclass
    AND contype = 'p'
    AND convalidated;

  SELECT array_agg(attribute.attname ORDER BY key_position.ordinality)
  INTO primary_columns
  FROM pg_constraint constraint_row
  CROSS JOIN LATERAL unnest(constraint_row.conkey)
    WITH ORDINALITY AS key_position(attnum, ordinality)
  JOIN pg_attribute attribute
    ON attribute.attrelid = constraint_row.conrelid
   AND attribute.attnum = key_position.attnum
  WHERE constraint_row.conrelid =
      'public.account_erasure_identity_outbox'::regclass
    AND constraint_row.contype = 'p'
    AND constraint_row.convalidated;

  IF primary_count <> 1
      OR primary_columns IS DISTINCT FROM ARRAY['identity_hash']::text[] THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0035 requires exactly one validated primary key on identity_hash';
  END IF;
END $$;

-- Normalize defaults as well as type/nullability. A same-shaped pre-existing
-- table must not smuggle unexpected values into future inserts.
ALTER TABLE public.account_erasure_identity_outbox
  ALTER COLUMN identity_hash DROP DEFAULT,
  ALTER COLUMN clerk_id DROP DEFAULT,
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN attempts SET DEFAULT 0,
  ALTER COLUMN next_attempt_at SET DEFAULT now(),
  ALTER COLUMN lease_token DROP DEFAULT,
  ALTER COLUMN lease_until DROP DEFAULT,
  ALTER COLUMN last_error DROP DEFAULT,
  ALTER COLUMN completed_at DROP DEFAULT,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

-- Rebuild the named invariants on rerun so constraint drift is repaired rather
-- than silently accepted. Invalid legacy rows make the whole migration abort.
ALTER TABLE public.account_erasure_identity_outbox
  DROP CONSTRAINT IF EXISTS account_erasure_identity_hash_chk,
  DROP CONSTRAINT IF EXISTS account_erasure_identity_attempts_chk,
  DROP CONSTRAINT IF EXISTS account_erasure_identity_state_chk;

ALTER TABLE public.account_erasure_identity_outbox
  ADD CONSTRAINT account_erasure_identity_hash_chk
    CHECK (identity_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT account_erasure_identity_attempts_chk CHECK (attempts >= 0),
  ADD CONSTRAINT account_erasure_identity_state_chk CHECK (
    (status = 'processing' AND clerk_id IS NOT NULL
      AND lease_token IS NOT NULL AND lease_until IS NOT NULL
      AND completed_at IS NULL)
    OR (status IN ('pending', 'failed') AND clerk_id IS NOT NULL
      AND lease_token IS NULL AND lease_until IS NULL
      AND completed_at IS NULL)
    OR (status = 'completed' AND clerk_id IS NULL
      AND lease_token IS NULL AND lease_until IS NULL
      AND completed_at IS NOT NULL)
  );

-- No foreign/composite/extra uniqueness constraint belongs on this queue.
-- Refuse such drift because it can make local erasure non-atomic or block the
-- provider retry independently of the account transaction.
DO $$
DECLARE
  unexpected_constraints text;
BEGIN
  SELECT string_agg(
    format('%I:%s', constraint_row.conname, constraint_row.contype),
    ', ' ORDER BY constraint_row.conname
  )
  INTO unexpected_constraints
  FROM pg_constraint AS constraint_row
  WHERE constraint_row.conrelid =
      'public.account_erasure_identity_outbox'::regclass
    AND NOT (
      constraint_row.convalidated
      AND (
        (constraint_row.conname = 'account_erasure_identity_outbox_pkey'
          AND constraint_row.contype = 'p')
        OR (constraint_row.conname IN (
          'account_erasure_identity_hash_chk',
          'account_erasure_identity_attempts_chk',
          'account_erasure_identity_state_chk'
        ) AND constraint_row.contype = 'c')
      )
    );

  IF unexpected_constraints IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0035 found unexpected/unvalidated tombstone constraints: '
        || unexpected_constraints;
  END IF;
END $$;

-- Refuse a same-name object owned by another relation. Without this preflight,
-- DROP INDEX could remove an unrelated index before rebuilding the queue's
-- canonical indexes.
DO $$
DECLARE
  index_name text;
  existing_kind "char";
  indexed_table oid;
BEGIN
  FOREACH index_name IN ARRAY ARRAY[
    'account_erasure_identity_due_idx',
    'account_erasure_identity_expired_lease_idx'
  ] LOOP
    SELECT relation.relkind, index_catalog.indrelid
    INTO existing_kind, indexed_table
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    LEFT JOIN pg_index AS index_catalog
      ON index_catalog.indexrelid = relation.oid
    WHERE namespace.nspname = 'public'
      AND relation.relname = index_name;

    IF existing_kind IS NOT NULL AND (
      existing_kind NOT IN ('i'::"char", 'I'::"char")
      OR indexed_table IS DISTINCT FROM
        'public.account_erasure_identity_outbox'::regclass
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = format(
          '0035 refuses non-canonical named index object public.%I',
          index_name
        );
    END IF;
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.account_erasure_identity_due_idx;
CREATE INDEX account_erasure_identity_due_idx
  ON public.account_erasure_identity_outbox (next_attempt_at, identity_hash)
  WHERE status IN ('pending', 'failed');

DROP INDEX IF EXISTS public.account_erasure_identity_expired_lease_idx;
CREATE INDEX account_erasure_identity_expired_lease_idx
  ON public.account_erasure_identity_outbox (lease_until, identity_hash)
  WHERE status = 'processing';

DO $$
DECLARE
  unexpected_indexes text;
  index_count integer;
BEGIN
  SELECT count(*)::integer,
    string_agg(
      index_relation.relname,
      ', ' ORDER BY index_relation.relname
    ) FILTER (WHERE
      index_relation.relname NOT IN (
        'account_erasure_identity_outbox_pkey',
        'account_erasure_identity_due_idx',
        'account_erasure_identity_expired_lease_idx'
      )
      OR NOT index_catalog.indisvalid
      OR NOT index_catalog.indisready
      OR NOT index_catalog.indislive
    )
  INTO index_count, unexpected_indexes
  FROM pg_index AS index_catalog
  JOIN pg_class AS index_relation
    ON index_relation.oid = index_catalog.indexrelid
  WHERE index_catalog.indrelid =
      'public.account_erasure_identity_outbox'::regclass;

  IF index_count <> 3 OR unexpected_indexes IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format(
        '0035 found non-canonical tombstone indexes: count=%s unexpected=%s',
        index_count,
        coalesce(unexpected_indexes, '<none>')
      );
  END IF;
END $$;

ALTER TABLE public.account_erasure_identity_outbox ENABLE ROW LEVEL SECURITY;
-- The trusted postgres.js connection runs as the table owner. With no public
-- policies, FORCE would also deny that worker; browser roles are instead
-- reduced to zero effective ACL below.
ALTER TABLE public.account_erasure_identity_outbox NO FORCE ROW LEVEL SECURITY;

-- Remove ordinary direct grants first. The block below also removes this
-- object's grants from inherited parent roles without changing role topology.
REVOKE ALL PRIVILEGES ON TABLE public.account_erasure_identity_outbox FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.account_erasure_identity_outbox FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.account_erasure_identity_outbox FROM authenticated;
REVOKE ALL PRIVILEGES (
  identity_hash, clerk_id, status, attempts, next_attempt_at, lease_token,
  lease_until, last_error, completed_at, created_at, updated_at
) ON TABLE public.account_erasure_identity_outbox FROM PUBLIC;
REVOKE ALL PRIVILEGES (
  identity_hash, clerk_id, status, attempts, next_attempt_at, lease_token,
  lease_until, last_error, completed_at, created_at, updated_at
) ON TABLE public.account_erasure_identity_outbox FROM anon;
REVOKE ALL PRIVILEGES (
  identity_hash, clerk_id, status, attempts, next_attempt_at, lease_token,
  lease_until, last_error, completed_at, created_at, updated_at
) ON TABLE public.account_erasure_identity_outbox FROM authenticated;

-- Remove object/column grants held by every parent role inherited by a Data
-- API browser role. This changes no membership or global role attribute.
DO $$
DECLARE
  inherited_role text;
  column_list text;
  policy_name text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
  INTO column_list
  FROM pg_attribute
  WHERE attrelid = 'public.account_erasure_identity_outbox'::regclass
    AND attnum > 0
    AND NOT attisdropped;

  FOR inherited_role IN
    WITH RECURSIVE browser_role_tree(role_oid, role_name) AS (
      SELECT oid, rolname
      FROM pg_roles
      WHERE rolname IN ('anon', 'authenticated')
      UNION
      SELECT parent.oid, parent.rolname
      FROM browser_role_tree child
      JOIN pg_auth_members membership ON membership.member = child.role_oid
      JOIN pg_roles parent ON parent.oid = membership.roleid
    )
    SELECT DISTINCT role_name
    FROM browser_role_tree
    ORDER BY role_name
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.account_erasure_identity_outbox FROM %I',
      inherited_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.account_erasure_identity_outbox FROM %I',
      column_list,
      inherited_role
    );
  END LOOP;

  -- This is a service-only queue. A policy left behind by drift could expose
  -- raw provider ids if an ACL is granted later, so keep the RLS surface empty.
  FOR policy_name IN
    SELECT polname
    FROM pg_policy
    WHERE polrelid = 'public.account_erasure_identity_outbox'::regclass
    ORDER BY polname
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON public.account_erasure_identity_outbox',
      policy_name
    );
  END LOOP;
END $$;

DO $$
DECLARE
  browser_role text;
  column_name text;
  privilege_name text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = 'public.account_erasure_identity_outbox'::regclass
      AND (NOT relrowsecurity OR relforcerowsecurity)
  ) OR EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.account_erasure_identity_outbox'::regclass
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0035 failed to establish owner-compatible, policy-free RLS';
  END IF;

  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH privilege_name IN ARRAY ARRAY[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
      'REFERENCES', 'TRIGGER'
    ] LOOP
      IF has_table_privilege(
        browser_role,
        'public.account_erasure_identity_outbox',
        privilege_name
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = format(
            '0035 found effective %s privilege for %s on the tombstone table',
            privilege_name,
            browser_role
          ),
          HINT = 'Remove the inherited/owner/BYPASSRLS privilege and retry; 0035 does not mutate role topology.';
      END IF;
    END LOOP;

    FOR column_name IN
      SELECT attname
      FROM pg_attribute
      WHERE attrelid = 'public.account_erasure_identity_outbox'::regclass
        AND attnum > 0
        AND NOT attisdropped
      ORDER BY attnum
    LOOP
      FOREACH privilege_name IN ARRAY ARRAY[
        'SELECT', 'INSERT', 'UPDATE', 'REFERENCES'
      ] LOOP
        IF has_column_privilege(
          browser_role,
          'public.account_erasure_identity_outbox',
          column_name,
          privilege_name
        ) THEN
          RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = format(
              '0035 found effective %s privilege for %s on tombstone column %s',
              privilege_name,
              browser_role,
              column_name
            );
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
