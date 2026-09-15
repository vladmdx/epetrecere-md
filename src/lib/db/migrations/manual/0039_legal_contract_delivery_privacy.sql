-- 0039 — Live recipient authorization and data minimization for signed-contract delivery.
--
-- Delivery rows retain only terminal channel/role/time evidence. Addresses are
-- cleared after delivery, cancellation, or erasure. Every pending recipient is
-- tied to a live users row and revalidated by the worker immediately before
-- provider send. This server-only queue remains closed to Data API roles.
-- Do not apply to Preview/Production without an explicit rollout.

BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DO $$
DECLARE
  relation_name text;
  relation_kind "char";
  relation_persistence "char";
  relation_is_partition boolean;
  relation_oid oid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated')
    HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42704',
      MESSAGE = '0039 requires the Supabase anon and authenticated roles';
  END IF;
  FOREACH relation_name IN ARRAY ARRAY[
    'users', 'legal_acceptances', 'legal_contract_delivery_outbox'
  ] LOOP
    SELECT relation.relkind, relation.relpersistence,
      relation.relispartition, relation.oid
    INTO relation_kind, relation_persistence,
      relation_is_partition, relation_oid
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = relation_name;

    IF relation_kind IS DISTINCT FROM 'r'::"char"
      OR relation_persistence IS DISTINCT FROM 'p'::"char"
      OR relation_is_partition IS DISTINCT FROM false
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '42P01',
        MESSAGE = format(
          '0039 requires public.%I to be a permanent non-partition ordinary table; kind=%s persistence=%s partition=%s',
          relation_name,
          coalesce(relation_kind::text, '<missing>'),
          coalesce(relation_persistence::text, '<missing>'),
          coalesce(relation_is_partition::text, '<missing>')
        );
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_inherits
      WHERE inhrelid = relation_oid OR inhparent = relation_oid
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = format(
          '0039 refuses inherited or inheritance-parent relation public.%I',
          relation_name
        );
    END IF;
  END LOOP;
END $$;

-- Match the runtime's user -> outbox ordering. This also freezes role/email and
-- acceptance bindings while the one-time recipient backfill is computed.
LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.legal_acceptances IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.legal_contract_delivery_outbox IN ACCESS EXCLUSIVE MODE;

-- Accept only the canonical 0030 table or the exact 0039 shape. Incompatible
-- same-name columns/defaults/serial ownership are not safe to reinterpret.
DO $$
DECLARE
  expected_legacy_columns text[] := ARRAY[
    'acceptance_session_id:uuid:NO',
    'anchor_acceptance_id:integer:NO',
    'attempts:integer:NO',
    'channel:text:NO',
    'created_at:timestamp with time zone:NO',
    'dead_lettered_at:timestamp with time zone:YES',
    'delivered_at:timestamp with time zone:YES',
    'id:integer:NO',
    'last_error:text:YES',
    'lease_token:uuid:YES',
    'locked_at:timestamp with time zone:YES',
    'next_attempt_at:timestamp with time zone:NO',
    'recipient_email:text:NO',
    'recipient_key:text:NO',
    'status:text:NO',
    'updated_at:timestamp with time zone:NO'
  ];
  expected_hardened_columns text[] := ARRAY[
    'acceptance_session_id:uuid:NO',
    'anchor_acceptance_id:integer:NO',
    'attempts:integer:NO',
    'cancelled_at:timestamp with time zone:YES',
    'channel:text:NO',
    'created_at:timestamp with time zone:NO',
    'dead_lettered_at:timestamp with time zone:YES',
    'delivered_at:timestamp with time zone:YES',
    'id:integer:NO',
    'last_error:text:YES',
    'lease_token:uuid:YES',
    'locked_at:timestamp with time zone:YES',
    'next_attempt_at:timestamp with time zone:NO',
    'recipient_email:text:YES',
    'recipient_key:text:NO',
    'recipient_role_snapshot:text:NO',
    'recipient_user_id:uuid:YES',
    'status:text:NO',
    'updated_at:timestamp with time zone:NO'
  ];
  actual_columns text[];
  default_count integer;
  id_default text;
  status_default text;
  attempts_default text;
  next_attempt_default text;
  created_default text;
  updated_default text;
  serial_sequence regclass;
  dependency_count integer;
  sequence_kind "char";
  sequence_persistence "char";
  sequence_owner oid;
  table_owner oid;
BEGIN
  SELECT array_agg(
    column_name || ':' || data_type || ':' || is_nullable
    ORDER BY column_name
  ) INTO actual_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'legal_contract_delivery_outbox';

  IF actual_columns IS DISTINCT FROM expected_legacy_columns
    AND actual_columns IS DISTINCT FROM expected_hardened_columns
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format(
        '0039 found a non-canonical legal delivery column shape: %s',
        coalesce(actual_columns::text, '<missing>')
      );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid =
        'public.legal_contract_delivery_outbox'::regclass
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
      MESSAGE = '0039 refuses dropped/identity/generated/inherited/typmod delivery columns';
  END IF;

  SELECT count(*)::integer,
    max(pg_get_expr(default_row.adbin, default_row.adrelid))
      FILTER (WHERE attribute.attname = 'id'),
    max(pg_get_expr(default_row.adbin, default_row.adrelid))
      FILTER (WHERE attribute.attname = 'status'),
    max(pg_get_expr(default_row.adbin, default_row.adrelid))
      FILTER (WHERE attribute.attname = 'attempts'),
    max(pg_get_expr(default_row.adbin, default_row.adrelid))
      FILTER (WHERE attribute.attname = 'next_attempt_at'),
    max(pg_get_expr(default_row.adbin, default_row.adrelid))
      FILTER (WHERE attribute.attname = 'created_at'),
    max(pg_get_expr(default_row.adbin, default_row.adrelid))
      FILTER (WHERE attribute.attname = 'updated_at')
  INTO default_count, id_default, status_default, attempts_default,
    next_attempt_default, created_default, updated_default
  FROM pg_attrdef AS default_row
  JOIN pg_attribute AS attribute
    ON attribute.attrelid = default_row.adrelid
   AND attribute.attnum = default_row.adnum
  WHERE default_row.adrelid =
      'public.legal_contract_delivery_outbox'::regclass;

  IF default_count <> 6
    OR (
      id_default IS DISTINCT FROM
        'nextval(''legal_contract_delivery_outbox_id_seq''::regclass)'
      AND id_default IS DISTINCT FROM
        'nextval(''public.legal_contract_delivery_outbox_id_seq''::regclass)'
    )
    OR status_default IS DISTINCT FROM '''pending''::text'
    OR attempts_default IS DISTINCT FROM '0'
    OR next_attempt_default IS DISTINCT FROM 'now()'
    OR created_default IS DISTINCT FROM 'now()'
    OR updated_default IS DISTINCT FROM 'now()'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format(
        '0039 found non-canonical delivery defaults: count=%s id=%s status=%s attempts=%s next=%s created=%s updated=%s',
        default_count,
        coalesce(id_default, '<missing>'),
        coalesce(status_default, '<missing>'),
        coalesce(attempts_default, '<missing>'),
        coalesce(next_attempt_default, '<missing>'),
        coalesce(created_default, '<missing>'),
        coalesce(updated_default, '<missing>')
      );
  END IF;

  SELECT pg_get_serial_sequence(
    'public.legal_contract_delivery_outbox', 'id'
  )::regclass,
    table_relation.relowner
  INTO serial_sequence, table_owner
  FROM pg_class AS table_relation
  WHERE table_relation.oid =
      'public.legal_contract_delivery_outbox'::regclass;

  SELECT sequence_relation.relkind, sequence_relation.relpersistence,
    sequence_relation.relowner
  INTO sequence_kind, sequence_persistence, sequence_owner
  FROM pg_class AS sequence_relation
  WHERE sequence_relation.oid = serial_sequence;

  SELECT count(*)::integer INTO dependency_count
  FROM pg_depend AS dependency
  JOIN pg_attribute AS attribute
    ON attribute.attrelid = dependency.refobjid
   AND attribute.attnum = dependency.refobjsubid
  WHERE dependency.classid = 'pg_class'::regclass
    AND dependency.objid = serial_sequence
    AND dependency.refobjid =
      'public.legal_contract_delivery_outbox'::regclass
    AND attribute.attname = 'id'
    AND dependency.deptype = 'a';

  IF serial_sequence IS DISTINCT FROM
      'public.legal_contract_delivery_outbox_id_seq'::regclass
    OR sequence_kind IS DISTINCT FROM 'S'::"char"
    OR sequence_persistence IS DISTINCT FROM 'p'::"char"
    OR sequence_owner IS DISTINCT FROM table_owner
    OR dependency_count <> 1
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0039 requires the canonical owned legal delivery serial sequence';
  END IF;
END $$;

-- Baseline evidence/FK constraints are not owned by 0039 and must be exact.
-- The four 0039-owned constraints may be absent or drifted because they are
-- safely rebuilt below; any other constraint is rejected.
DO $$
DECLARE
  id_attnum smallint;
  session_attnum smallint;
  anchor_attnum smallint;
  channel_attnum smallint;
  recipient_key_attnum smallint;
  target_id_attnum smallint;
  target_session_attnum smallint;
  unexpected_constraints text;
BEGIN
  SELECT attnum INTO id_attnum FROM pg_attribute
  WHERE attrelid = 'public.legal_contract_delivery_outbox'::regclass
    AND attname = 'id' AND NOT attisdropped;
  SELECT attnum INTO session_attnum FROM pg_attribute
  WHERE attrelid = 'public.legal_contract_delivery_outbox'::regclass
    AND attname = 'acceptance_session_id' AND NOT attisdropped;
  SELECT attnum INTO anchor_attnum FROM pg_attribute
  WHERE attrelid = 'public.legal_contract_delivery_outbox'::regclass
    AND attname = 'anchor_acceptance_id' AND NOT attisdropped;
  SELECT attnum INTO channel_attnum FROM pg_attribute
  WHERE attrelid = 'public.legal_contract_delivery_outbox'::regclass
    AND attname = 'channel' AND NOT attisdropped;
  SELECT attnum INTO recipient_key_attnum FROM pg_attribute
  WHERE attrelid = 'public.legal_contract_delivery_outbox'::regclass
    AND attname = 'recipient_key' AND NOT attisdropped;
  SELECT attnum INTO target_id_attnum FROM pg_attribute
  WHERE attrelid = 'public.legal_acceptances'::regclass
    AND attname = 'id' AND NOT attisdropped;
  SELECT attnum INTO target_session_attnum FROM pg_attribute
  WHERE attrelid = 'public.legal_acceptances'::regclass
    AND attname = 'acceptance_session_id' AND NOT attisdropped;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.legal_contract_delivery_outbox'::regclass
      AND conname = 'legal_contract_delivery_outbox_pkey'
      AND contype = 'p'
      AND conkey = ARRAY[id_attnum]::smallint[]
      AND convalidated AND NOT condeferrable AND NOT condeferred
      AND conislocal AND coninhcount = 0 AND conparentid = 0
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.legal_contract_delivery_outbox'::regclass
      AND conname = 'legal_contract_delivery_recipient_unique'
      AND contype = 'u'
      AND conkey = ARRAY[
        session_attnum, channel_attnum, recipient_key_attnum
      ]::smallint[]
      AND convalidated AND NOT condeferrable AND NOT condeferred
      AND conislocal AND coninhcount = 0 AND conparentid = 0
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.legal_contract_delivery_outbox'::regclass
      AND conname = 'legal_contract_delivery_anchor_session_fk'
      AND contype = 'f'
      AND conkey = ARRAY[anchor_attnum, session_attnum]::smallint[]
      AND confrelid = 'public.legal_acceptances'::regclass
      AND confkey = ARRAY[target_id_attnum, target_session_attnum]::smallint[]
      AND confdeltype = 'r' AND confupdtype = 'a' AND confmatchtype = 's'
      AND convalidated AND NOT condeferrable AND NOT condeferred
      AND conislocal AND coninhcount = 0 AND conparentid = 0
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.legal_contract_delivery_outbox'::regclass
      AND conname = 'legal_contract_delivery_channel_chk'
      AND contype = 'c'
      AND conkey = ARRAY[channel_attnum]::smallint[]
      AND convalidated AND NOT connoinherit
      AND conislocal AND coninhcount = 0 AND conparentid = 0
      AND regexp_replace(
        lower(pg_get_constraintdef(oid)), '[[:space:]()]', '', 'g'
      ) = 'checkchannel=anyarray[''signer''::text,''admin''::text]'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0039 requires exact canonical baseline delivery constraints';
  END IF;

  SELECT string_agg(
    format('%I:%s', conname, contype), ', ' ORDER BY conname
  ) INTO unexpected_constraints
  FROM pg_constraint
  WHERE conrelid = 'public.legal_contract_delivery_outbox'::regclass
    AND conname NOT IN (
      'legal_contract_delivery_outbox_pkey',
      'legal_contract_delivery_recipient_unique',
      'legal_contract_delivery_anchor_session_fk',
      'legal_contract_delivery_channel_chk',
      'legal_contract_delivery_status_chk',
      'legal_contract_delivery_recipient_user_fk',
      'legal_contract_delivery_role_snapshot_chk',
      'legal_contract_delivery_recipient_state_chk'
    );
  IF unexpected_constraints IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0039 found unexpected legal delivery constraints: '
        || unexpected_constraints;
  END IF;
END $$;

-- Only the two queue indexes owned by 0039 may be rebuilt. Refuse a public
-- same-name object on another relation before any DROP INDEX is attempted.
DO $$
DECLARE
  index_name text;
  existing_kind "char";
  indexed_table oid;
  constraint_backed_count integer;
  unexpected_indexes text;
BEGIN
  FOREACH index_name IN ARRAY ARRAY[
    'legal_contract_delivery_pending_idx',
    'legal_contract_delivery_recipient_user_idx'
  ] LOOP
    SELECT relation.relkind, index_catalog.indrelid,
      (SELECT count(*)::integer FROM pg_constraint
       WHERE conindid = relation.oid)
    INTO existing_kind, indexed_table, constraint_backed_count
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    LEFT JOIN pg_index AS index_catalog
      ON index_catalog.indexrelid = relation.oid
    WHERE namespace.nspname = 'public'
      AND relation.relname = index_name;

    IF existing_kind IS NOT NULL AND (
      existing_kind NOT IN ('i'::"char", 'I'::"char")
      OR indexed_table IS DISTINCT FROM
        'public.legal_contract_delivery_outbox'::regclass
      OR constraint_backed_count <> 0
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = format(
          '0039 refuses same-name foreign index object public.%I', index_name
        );
    END IF;
  END LOOP;

  SELECT string_agg(index_relation.relname, ', ' ORDER BY index_relation.relname)
  INTO unexpected_indexes
  FROM pg_index AS index_catalog
  JOIN pg_class AS index_relation
    ON index_relation.oid = index_catalog.indexrelid
  WHERE index_catalog.indrelid =
      'public.legal_contract_delivery_outbox'::regclass
    AND index_relation.relname NOT IN (
      'legal_contract_delivery_outbox_pkey',
      'legal_contract_delivery_recipient_unique',
      'legal_contract_delivery_pending_idx',
      'legal_contract_delivery_session_idx',
      'legal_contract_delivery_recipient_user_idx'
    );
  IF unexpected_indexes IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0039 found unexpected legal delivery indexes: '
        || unexpected_indexes;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS index_catalog
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_catalog.indexrelid
    JOIN pg_am AS access_method
      ON access_method.oid = index_relation.relam
    WHERE index_catalog.indrelid =
        'public.legal_contract_delivery_outbox'::regclass
      AND index_relation.relname = 'legal_contract_delivery_session_idx'
      AND access_method.amname = 'btree'
      AND NOT index_catalog.indisunique
      AND NOT index_catalog.indisprimary
      AND index_catalog.indpred IS NULL
      AND index_catalog.indexprs IS NULL
      AND index_catalog.indnkeyatts = 1
      AND index_catalog.indnatts = 1
      AND index_catalog.indkey[0] = (
        SELECT attnum FROM pg_attribute
        WHERE attrelid = index_catalog.indrelid
          AND attname = 'acceptance_session_id' AND NOT attisdropped
      )
      AND index_catalog.indisvalid AND index_catalog.indisready
      AND index_catalog.indislive AND index_catalog.indimmediate
      AND NOT index_catalog.indisexclusion
      AND NOT index_catalog.indisclustered
      AND NOT index_catalog.indisreplident
      AND NOT index_catalog.indnullsnotdistinct
      AND index_relation.reltablespace = 0
      AND index_relation.reloptions IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0039 requires the exact canonical delivery session index';
  END IF;
END $$;

ALTER TABLE public.legal_contract_delivery_outbox
  ADD COLUMN IF NOT EXISTS recipient_user_id uuid,
  ADD COLUMN IF NOT EXISTS recipient_role_snapshot text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE public.legal_contract_delivery_outbox
  ALTER COLUMN recipient_email DROP NOT NULL;

-- Existing 0030 recipient keys were the users.id for both live channels.
UPDATE public.legal_contract_delivery_outbox AS delivery
SET recipient_user_id = app_user.id
FROM public.users AS app_user
WHERE delivery.recipient_user_id IS NULL
  AND delivery.recipient_key = app_user.id::text;

-- Recover a signer binding even for a hand-created/legacy key when its
-- immutable acceptance still has a live user.
UPDATE public.legal_contract_delivery_outbox AS delivery
SET recipient_user_id = acceptance.user_id
FROM public.legal_acceptances AS acceptance
WHERE delivery.channel = 'signer'
  AND delivery.recipient_user_id IS NULL
  AND delivery.anchor_acceptance_id = acceptance.id
  AND delivery.acceptance_session_id = acceptance.acceptance_session_id
  AND acceptance.user_id IS NOT NULL;

UPDATE public.legal_contract_delivery_outbox AS delivery
SET recipient_role_snapshot = CASE
  WHEN delivery.channel = 'signer' THEN 'signer'
  WHEN app_user.role::text = 'super_admin' THEN 'super_admin'
  ELSE 'admin'
END
FROM public.users AS app_user
WHERE delivery.recipient_role_snapshot IS NULL
  AND delivery.recipient_user_id = app_user.id;

UPDATE public.legal_contract_delivery_outbox
SET recipient_role_snapshot = CASE
  WHEN channel = 'signer' THEN 'signer'
  ELSE 'admin'
END
WHERE recipient_role_snapshot IS NULL;

-- A delivered receipt needs its terminal time/channel/role, not an address.
UPDATE public.legal_contract_delivery_outbox
SET recipient_email = NULL,
    updated_at = greatest(updated_at, delivered_at)
WHERE delivered_at IS NOT NULL
  AND recipient_email IS NOT NULL;

-- A permanently failed provider attempt needs only its terminal state,
-- attempt count, safe failure class and timestamp. Remove every routable or
-- linkable recipient identifier, including rows dead-lettered before 0039.
UPDATE public.legal_contract_delivery_outbox
SET recipient_user_id = NULL,
    recipient_email = NULL,
    recipient_key = 'retired:' || id::text,
    locked_at = NULL,
    lease_token = NULL,
    dead_lettered_at = coalesce(dead_lettered_at, updated_at, created_at),
    last_error = CASE
      WHEN recipient_user_id IS NOT NULL
        OR recipient_email IS NOT NULL
        OR recipient_key IS DISTINCT FROM 'retired:' || id::text
      THEN '{"code":"LEGACY_DEAD_LETTER_REDACTED"}'
      ELSE last_error
    END,
    updated_at = greatest(
      updated_at,
      coalesce(dead_lettered_at, updated_at, created_at)
    )
WHERE status = 'dead_letter'
  AND delivered_at IS NULL
  AND (
    dead_lettered_at IS NULL
    OR
    recipient_user_id IS NOT NULL
    OR recipient_email IS NOT NULL
    OR recipient_key IS DISTINCT FROM 'retired:' || id::text
    OR locked_at IS NOT NULL
    OR lease_token IS NOT NULL
  );

-- The 0030 status CHECK does not yet include 'cancelled'. Replace it inside
-- this migration transaction before cancelling unsendable legacy rows; the
-- canonical CHECK is installed below before commit.
ALTER TABLE public.legal_contract_delivery_outbox
  DROP CONSTRAINT IF EXISTS legal_contract_delivery_status_chk;

-- Fail closed for legacy pending rows whose account, address, role, or signer
-- binding is no longer live. Use an opaque row-local key after minimization.
UPDATE public.legal_contract_delivery_outbox AS delivery
SET status = 'cancelled',
    cancelled_at = coalesce(delivery.cancelled_at, now()),
    recipient_user_id = NULL,
    recipient_email = NULL,
    recipient_key = 'retired:' || delivery.id::text,
    locked_at = NULL,
    lease_token = NULL,
    dead_lettered_at = NULL,
    last_error = NULL,
    updated_at = now()
WHERE delivery.status IN ('pending', 'failed', 'processing')
  AND delivery.delivered_at IS NULL
  AND (
    -- No contract, including an administrator copy, remains sendable after
    -- the session signer has been erased.
    NOT EXISTS (
      SELECT 1
      FROM public.legal_acceptances AS signer_acceptance
      JOIN public.users AS signer_user
        ON signer_user.id = signer_acceptance.user_id
      WHERE signer_acceptance.id = delivery.anchor_acceptance_id
        AND signer_acceptance.acceptance_session_id =
          delivery.acceptance_session_id
    )
    OR NOT EXISTS (
      SELECT 1
      FROM public.users AS app_user
      WHERE app_user.id = delivery.recipient_user_id
        AND lower(btrim(app_user.email)) =
          lower(btrim(delivery.recipient_email))
        AND (
          (
            delivery.channel = 'admin'
            AND delivery.recipient_role_snapshot IN ('admin', 'super_admin')
            AND app_user.role::text IN ('admin', 'super_admin')
          )
          OR (
            delivery.channel = 'signer'
            AND delivery.recipient_role_snapshot = 'signer'
            AND EXISTS (
              SELECT 1
              FROM public.legal_acceptances AS acceptance
              WHERE acceptance.id = delivery.anchor_acceptance_id
                AND acceptance.acceptance_session_id =
                  delivery.acceptance_session_id
                AND acceptance.user_id = app_user.id
            )
          )
        )
    )
  );

ALTER TABLE public.legal_contract_delivery_outbox
  ALTER COLUMN recipient_role_snapshot SET NOT NULL;

ALTER TABLE public.legal_contract_delivery_outbox
  DROP CONSTRAINT IF EXISTS legal_contract_delivery_recipient_user_fk,
  DROP CONSTRAINT IF EXISTS legal_contract_delivery_status_chk,
  DROP CONSTRAINT IF EXISTS legal_contract_delivery_role_snapshot_chk,
  DROP CONSTRAINT IF EXISTS legal_contract_delivery_recipient_state_chk;

ALTER TABLE public.legal_contract_delivery_outbox
  ADD CONSTRAINT legal_contract_delivery_recipient_user_fk
    FOREIGN KEY (recipient_user_id) REFERENCES public.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT legal_contract_delivery_status_chk
    CHECK (status IN (
      'pending', 'processing', 'delivered', 'failed', 'dead_letter', 'cancelled'
    )),
  ADD CONSTRAINT legal_contract_delivery_role_snapshot_chk
    CHECK (recipient_role_snapshot IN ('signer', 'admin', 'super_admin')),
  ADD CONSTRAINT legal_contract_delivery_recipient_state_chk CHECK (
    (
      status IN ('pending', 'failed')
      AND delivered_at IS NULL
      AND dead_lettered_at IS NULL
      AND cancelled_at IS NULL
      AND recipient_user_id IS NOT NULL
      AND recipient_email IS NOT NULL
      AND locked_at IS NULL
      AND lease_token IS NULL
    )
    OR (
      status = 'processing'
      AND delivered_at IS NULL
      AND dead_lettered_at IS NULL
      AND cancelled_at IS NULL
      AND recipient_user_id IS NOT NULL
      AND recipient_email IS NOT NULL
      AND locked_at IS NOT NULL
      AND lease_token IS NOT NULL
    )
    OR (
      status = 'delivered'
      AND delivered_at IS NOT NULL
      AND dead_lettered_at IS NULL
      AND cancelled_at IS NULL
      AND recipient_email IS NULL
      AND locked_at IS NULL
      AND lease_token IS NULL
    )
    OR (
      status = 'dead_letter'
      AND delivered_at IS NULL
      AND dead_lettered_at IS NOT NULL
      AND cancelled_at IS NULL
      AND recipient_user_id IS NULL
      AND recipient_email IS NULL
      AND recipient_key = 'retired:' || id::text
      AND locked_at IS NULL
      AND lease_token IS NULL
    )
    OR (
      status = 'cancelled'
      AND delivered_at IS NULL
      AND dead_lettered_at IS NULL
      AND cancelled_at IS NOT NULL
      AND recipient_user_id IS NULL
      AND recipient_email IS NULL
      AND locked_at IS NULL
      AND lease_token IS NULL
    )
  );

DROP INDEX IF EXISTS public.legal_contract_delivery_pending_idx;
CREATE INDEX legal_contract_delivery_pending_idx
  ON public.legal_contract_delivery_outbox (next_attempt_at, created_at)
  WHERE delivered_at IS NULL
    AND dead_lettered_at IS NULL
    AND cancelled_at IS NULL;

DROP INDEX IF EXISTS public.legal_contract_delivery_recipient_user_idx;
CREATE INDEX legal_contract_delivery_recipient_user_idx
  ON public.legal_contract_delivery_outbox (recipient_user_id);

-- Compare the complete relevant post-repair constraint/index catalog. This
-- catches wrong same-name indexes, INCLUDE/expression keys, non-default
-- opclasses/collations/order, invalid indexes, and unexpected extras.
DO $$
DECLARE
  expected record;
  actual record;
  constraint_count integer;
  unexpected_constraints text;
  index_count integer;
BEGIN
  SELECT count(*)::integer,
    string_agg(
      format('%I:%s', conname, contype), ', ' ORDER BY conname
    ) FILTER (WHERE
      conname NOT IN (
        'legal_contract_delivery_outbox_pkey',
        'legal_contract_delivery_recipient_unique',
        'legal_contract_delivery_anchor_session_fk',
        'legal_contract_delivery_channel_chk',
        'legal_contract_delivery_status_chk',
        'legal_contract_delivery_recipient_user_fk',
        'legal_contract_delivery_role_snapshot_chk',
        'legal_contract_delivery_recipient_state_chk'
      )
      OR NOT convalidated
      OR condeferrable
      OR condeferred
      OR NOT conislocal
      OR coninhcount <> 0
      OR conparentid <> 0
    )
  INTO constraint_count, unexpected_constraints
  FROM pg_constraint
  WHERE conrelid = 'public.legal_contract_delivery_outbox'::regclass;

  IF constraint_count <> 8 OR unexpected_constraints IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format(
        '0039 found non-canonical delivery constraints: count=%s unexpected=%s',
        constraint_count, coalesce(unexpected_constraints, '<none>')
      );
  END IF;

  SELECT count(*)::integer INTO index_count
  FROM pg_index
  WHERE indrelid = 'public.legal_contract_delivery_outbox'::regclass;
  IF index_count <> 5 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format(
        '0039 found non-canonical delivery index count: %s', index_count
      );
  END IF;

  FOR expected IN
    SELECT * FROM (VALUES
      (
        'legal_contract_delivery_outbox_pkey'::text,
        ARRAY['id']::text[], NULL::text,
        true, true, 1
      ),
      (
        'legal_contract_delivery_recipient_unique'::text,
        ARRAY['acceptance_session_id', 'channel', 'recipient_key']::text[],
        NULL::text, true, false, 1
      ),
      (
        'legal_contract_delivery_pending_idx'::text,
        ARRAY['next_attempt_at', 'created_at']::text[],
        'delivered_atisnullanddead_lettered_atisnullandcancelled_atisnull'::text,
        false, false, 0
      ),
      (
        'legal_contract_delivery_session_idx'::text,
        ARRAY['acceptance_session_id']::text[], NULL::text,
        false, false, 0
      ),
      (
        'legal_contract_delivery_recipient_user_idx'::text,
        ARRAY['recipient_user_id']::text[], NULL::text,
        false, false, 0
      )
    ) AS expected_shape(
      index_name, key_columns, predicate, is_unique, is_primary,
      constraint_backed_count
    )
  LOOP
    SELECT
      index_relation.relkind AS relation_kind,
      index_relation.relowner = table_relation.relowner AS owner_matches,
      index_relation.reltablespace AS tablespace_oid,
      index_relation.reloptions AS relation_options,
      access_method.amname AS access_method,
      ARRAY(
        SELECT attribute.attname::text
        FROM generate_series(0, index_catalog.indnkeyatts - 1)
          AS key_position(position)
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = index_catalog.indrelid
         AND attribute.attnum = index_catalog.indkey[key_position.position]
        ORDER BY key_position.position
      ) AS key_columns,
      CASE WHEN index_catalog.indpred IS NULL THEN NULL ELSE
        regexp_replace(
          lower(pg_get_expr(index_catalog.indpred, index_catalog.indrelid)),
          '[[:space:]()]', '', 'g'
        )
      END AS predicate,
      index_catalog.indisunique AS is_unique,
      index_catalog.indisprimary AS is_primary,
      index_catalog.indisexclusion AS is_exclusion,
      index_catalog.indimmediate AS is_immediate,
      index_catalog.indisvalid AS is_valid,
      index_catalog.indisready AS is_ready,
      index_catalog.indislive AS is_live,
      index_catalog.indisclustered AS is_clustered,
      index_catalog.indisreplident AS is_replica_identity,
      index_catalog.indnullsnotdistinct AS nulls_not_distinct,
      index_catalog.indexprs IS NULL AS expression_free,
      index_catalog.indnkeyatts AS key_count,
      index_catalog.indnatts AS attribute_count,
      NOT EXISTS (
        SELECT 1
        FROM generate_series(0, index_catalog.indnkeyatts - 1)
          AS key_position(position)
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = index_catalog.indrelid
         AND attribute.attnum = index_catalog.indkey[key_position.position]
        WHERE index_catalog.indcollation[key_position.position]
          IS DISTINCT FROM attribute.attcollation
          OR index_catalog.indoption[key_position.position] <> 0
          OR NOT EXISTS (
            SELECT 1 FROM pg_opclass AS operator_class
            WHERE operator_class.oid =
                index_catalog.indclass[key_position.position]
              AND operator_class.opcdefault
              AND operator_class.opcintype = attribute.atttypid
          )
      ) AS default_column_semantics,
      (
        SELECT count(*)::integer FROM pg_constraint
        WHERE conindid = index_catalog.indexrelid
      ) AS constraint_backed_count
    INTO actual
    FROM pg_class AS index_relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = index_relation.relnamespace
    JOIN pg_index AS index_catalog
      ON index_catalog.indexrelid = index_relation.oid
    JOIN pg_class AS table_relation
      ON table_relation.oid = index_catalog.indrelid
    JOIN pg_am AS access_method ON access_method.oid = index_relation.relam
    WHERE namespace.nspname = 'public'
      AND index_relation.relname = expected.index_name
      AND index_catalog.indrelid =
        'public.legal_contract_delivery_outbox'::regclass;

    IF actual.relation_kind IS DISTINCT FROM 'i'::"char"
      OR actual.owner_matches IS DISTINCT FROM true
      OR actual.tablespace_oid IS DISTINCT FROM 0::oid
      OR actual.relation_options IS NOT NULL
      OR actual.access_method IS DISTINCT FROM 'btree'
      OR actual.key_columns IS DISTINCT FROM expected.key_columns
      OR actual.predicate IS DISTINCT FROM expected.predicate
      OR actual.is_unique IS DISTINCT FROM expected.is_unique
      OR actual.is_primary IS DISTINCT FROM expected.is_primary
      OR actual.is_exclusion IS DISTINCT FROM false
      OR actual.is_immediate IS DISTINCT FROM true
      OR actual.is_valid IS DISTINCT FROM true
      OR actual.is_ready IS DISTINCT FROM true
      OR actual.is_live IS DISTINCT FROM true
      OR actual.is_clustered IS DISTINCT FROM false
      OR actual.is_replica_identity IS DISTINCT FROM false
      OR actual.nulls_not_distinct IS DISTINCT FROM false
      OR actual.expression_free IS DISTINCT FROM true
      OR actual.key_count IS DISTINCT FROM
        cardinality(expected.key_columns)
      OR actual.attribute_count IS DISTINCT FROM
        cardinality(expected.key_columns)
      OR actual.default_column_semantics IS DISTINCT FROM true
      OR actual.constraint_backed_count IS DISTINCT FROM
        expected.constraint_backed_count
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = format(
          '0039 failed exact catalog verification for index %I',
          expected.index_name
        );
    END IF;
  END LOOP;
END $$;

-- This queue has no browser workflow. Remove policies and all effective Data
-- API grants, including column grants and privileges inherited by browser roles.
DO $$
DECLARE policy_name text;
BEGIN
  FOR policy_name IN
    SELECT polname FROM pg_policy
    WHERE polrelid = 'public.legal_contract_delivery_outbox'::regclass
    ORDER BY polname
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON public.legal_contract_delivery_outbox',
      policy_name
    );
  END LOOP;
END $$;

ALTER TABLE public.legal_contract_delivery_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_contract_delivery_outbox NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  inherited_role text;
  column_list text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
  INTO column_list
  FROM pg_attribute
  WHERE attrelid = 'public.legal_contract_delivery_outbox'::regclass
    AND attnum > 0
    AND NOT attisdropped;

  REVOKE ALL PRIVILEGES ON TABLE public.legal_contract_delivery_outbox FROM PUBLIC;
  EXECUTE format(
    'REVOKE ALL PRIVILEGES (%s) ON TABLE public.legal_contract_delivery_outbox FROM PUBLIC',
    column_list
  );
  REVOKE ALL PRIVILEGES ON SEQUENCE public.legal_contract_delivery_outbox_id_seq FROM PUBLIC;

  FOR inherited_role IN
    WITH RECURSIVE browser_role_tree(role_oid, role_name) AS (
      SELECT oid, rolname FROM pg_roles
      WHERE rolname IN ('anon', 'authenticated')
      UNION
      SELECT parent.oid, parent.rolname
      FROM browser_role_tree AS child
      JOIN pg_auth_members AS membership ON membership.member = child.role_oid
      JOIN pg_roles AS parent ON parent.oid = membership.roleid
    )
    SELECT DISTINCT role_name FROM browser_role_tree ORDER BY role_name
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.legal_contract_delivery_outbox FROM %I',
      inherited_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.legal_contract_delivery_outbox FROM %I',
      column_list,
      inherited_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON SEQUENCE public.legal_contract_delivery_outbox_id_seq FROM %I',
      inherited_role
    );
  END LOOP;
END $$;

DO $$
DECLARE
  audited_role text;
  column_name text;
  privilege_name text;
  recipient_user_attnum smallint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.legal_contract_delivery_outbox'::regclass
      AND (NOT relrowsecurity OR relforcerowsecurity)
  ) OR EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.legal_contract_delivery_outbox'::regclass
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0039 failed to install owner-compatible policy-free RLS';
  END IF;

  SELECT attnum INTO recipient_user_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.legal_contract_delivery_outbox'::regclass
    AND attname = 'recipient_user_id'
    AND NOT attisdropped;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.legal_contract_delivery_outbox'::regclass
      AND conname = 'legal_contract_delivery_recipient_user_fk'
      AND contype = 'f'
      AND conkey = ARRAY[recipient_user_attnum]::smallint[]
      AND confrelid = 'public.users'::regclass
      AND confdeltype = 'n'
      AND convalidated
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0039 failed to install recipient_user_id ON DELETE SET NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.legal_contract_delivery_outbox
    WHERE recipient_role_snapshot IS NULL
      OR (delivered_at IS NOT NULL AND recipient_email IS NOT NULL)
      OR (
        status IN ('pending', 'failed')
        AND (
          delivered_at IS NOT NULL OR dead_lettered_at IS NOT NULL
          OR cancelled_at IS NOT NULL OR recipient_user_id IS NULL
          OR recipient_email IS NULL OR locked_at IS NOT NULL
          OR lease_token IS NOT NULL
        )
      )
      OR (
        status = 'processing'
        AND (
          delivered_at IS NOT NULL OR dead_lettered_at IS NOT NULL
          OR cancelled_at IS NOT NULL OR recipient_user_id IS NULL
          OR recipient_email IS NULL OR locked_at IS NULL
          OR lease_token IS NULL
        )
      )
      OR (
        status = 'dead_letter'
        AND (
          delivered_at IS NOT NULL OR dead_lettered_at IS NULL
          OR cancelled_at IS NOT NULL OR recipient_user_id IS NOT NULL
          OR recipient_email IS NOT NULL
          OR recipient_key IS DISTINCT FROM 'retired:' || id::text
          OR locked_at IS NOT NULL OR lease_token IS NOT NULL
        )
      )
      OR (
        status = 'cancelled'
        AND (
          delivered_at IS NOT NULL OR dead_lettered_at IS NOT NULL
          OR cancelled_at IS NULL OR recipient_email IS NOT NULL
          OR recipient_user_id IS NOT NULL OR locked_at IS NOT NULL
          OR lease_token IS NOT NULL
        )
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0039 failed legal-delivery minimization invariants';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.legal_contract_delivery_outbox AS delivery
    WHERE delivery.status IN ('pending', 'processing', 'failed')
      AND NOT EXISTS (
        SELECT 1
        FROM public.legal_acceptances AS signer_acceptance
        JOIN public.users AS signer_user
          ON signer_user.id = signer_acceptance.user_id
        WHERE signer_acceptance.id = delivery.anchor_acceptance_id
          AND signer_acceptance.acceptance_session_id =
            delivery.acceptance_session_id
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0039 left sendable delivery for a non-live session signer';
  END IF;

  FOR audited_role IN
    WITH RECURSIVE browser_role_tree(role_oid, role_name) AS (
      SELECT oid, rolname FROM pg_roles
      WHERE rolname IN ('anon', 'authenticated')
      UNION
      SELECT parent.oid, parent.rolname
      FROM browser_role_tree AS child
      JOIN pg_auth_members AS membership ON membership.member = child.role_oid
      JOIN pg_roles AS parent ON parent.oid = membership.roleid
    )
    SELECT DISTINCT role_name FROM browser_role_tree ORDER BY role_name
  LOOP
    FOR privilege_name IN
      SELECT DISTINCT supported_privilege.privilege_type
      FROM pg_class AS target_relation
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        pg_catalog.acldefault('r', target_relation.relowner)
      ) AS supported_privilege
      WHERE target_relation.oid = 'public.legal_contract_delivery_outbox'::regclass
    LOOP
      IF has_table_privilege(
        audited_role,
        'public.legal_contract_delivery_outbox',
        privilege_name
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = format(
            '0039 found effective %s table privilege for %s',
            privilege_name,
            audited_role
          );
      END IF;
    END LOOP;

    FOR column_name IN
      SELECT attname FROM pg_attribute
      WHERE attrelid = 'public.legal_contract_delivery_outbox'::regclass
        AND attnum > 0 AND NOT attisdropped
    LOOP
      FOREACH privilege_name IN ARRAY ARRAY[
        'SELECT', 'INSERT', 'UPDATE', 'REFERENCES'
      ] LOOP
        IF has_column_privilege(
          audited_role,
          'public.legal_contract_delivery_outbox',
          column_name,
          privilege_name
        ) THEN
          RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = format(
              '0039 found effective %s column privilege for %s on %s',
              privilege_name,
              audited_role,
              column_name
            );
        END IF;
      END LOOP;
    END LOOP;

    FOR privilege_name IN
      SELECT DISTINCT supported_privilege.privilege_type
      FROM pg_class AS target_sequence
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        pg_catalog.acldefault('s', target_sequence.relowner)
      ) AS supported_privilege
      WHERE target_sequence.oid =
        'public.legal_contract_delivery_outbox_id_seq'::regclass
    LOOP
      IF has_sequence_privilege(
        audited_role,
        'public.legal_contract_delivery_outbox_id_seq',
        privilege_name
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = format(
            '0039 found effective %s sequence privilege for %s',
            privilege_name,
            audited_role
          );
      END IF;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
