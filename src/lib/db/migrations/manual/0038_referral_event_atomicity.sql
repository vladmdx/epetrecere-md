-- 0038 — Enforce one referral credit per referrer/referee/milestone.
--
-- `triggerReferral()` uses this exact arbiter for INSERT ... ON CONFLICT.
-- Without it PostgreSQL raises 42P10 and the durable booking-confirmation
-- worker can never complete its referral step. Existing duplicates are
-- financial evidence and are never deleted automatically: rollout aborts for
-- explicit reconciliation instead.
--
-- referral_events is server-only financial evidence. RLS remains compatible
-- with the trusted table-owner runtime, while Data API roles and every role
-- they inherit lose all effective table, column, and sequence privileges.
-- Erasing either user nulls only that identity reference; the immutable
-- milestone, amount, allowlisted non-identifying metadata, and timestamp remain
-- as financial evidence. Historical arbitrary metadata is minimized in-place.
-- 0038 depends only on the canonical pre-index referral schema, not on 0037.
-- Do not apply to Preview/Production without an explicit rollout.

BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DO $$
DECLARE
  relation_kind "char";
  relation_persistence "char";
  relation_is_partition boolean;
  relation_oid oid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated')
    HAVING count(*) = 2
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42704',
      MESSAGE = '0038 requires the Supabase anon and authenticated roles';
  END IF;

  SELECT relation.relkind, relation.relpersistence, relation.relispartition,
    relation.oid
  INTO relation_kind, relation_persistence, relation_is_partition, relation_oid
  FROM pg_class AS relation
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'referral_events';

  IF relation_kind IS DISTINCT FROM 'r'::"char"
    OR relation_persistence IS DISTINCT FROM 'p'::"char"
    OR relation_is_partition IS DISTINCT FROM false
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42P01',
      MESSAGE = format(
        '0038 requires public.referral_events to be a permanent non-partition ordinary table; kind=%s persistence=%s partition=%s',
        coalesce(relation_kind::text, '<missing>'),
        coalesce(relation_persistence::text, '<missing>'),
        coalesce(relation_is_partition::text, '<missing>')
      );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_inherits
    WHERE inhrelid = relation_oid OR inhparent = relation_oid
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0038 refuses an inherited or inheritance-parent referral_events table';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'users'
      AND relation.relkind = 'r'
      AND relation.relpersistence = 'p'
      AND NOT relation.relispartition
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42P01',
      MESSAGE = '0038 requires canonical public.users';
  END IF;
END $$;

-- Match runtime capture's global graph-lock edge, then block user mutations
-- before locking the ledger. Existing referral-credit writers lock users
-- before inserting ledger rows, so this order avoids a users/ledger deadlock.
SELECT pg_advisory_xact_lock(280044, 0);
LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE;

-- Serialize the duplicate check, index replacement, and security hardening
-- with every referral writer. A timeout aborts the complete transaction.
LOCK TABLE public.referral_events IN ACCESS EXCLUSIVE MODE;

-- Refuse an already-cyclic or abnormally deep legacy attribution graph.
-- Automatic repair could move attribution and therefore credits; rollout
-- must stop for explicit reconciliation instead.
DO $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE referral_walk AS (
      SELECT graph_user.id,
        graph_user.referred_by_code,
        ARRAY[graph_user.id]::uuid[] AS path,
        false AS cycle,
        0::integer AS depth
      FROM public.users AS graph_user
      WHERE graph_user.referred_by_code IS NOT NULL

      UNION ALL

      SELECT next_user.id,
        next_user.referred_by_code,
        referral_walk.path || next_user.id,
        next_user.id = ANY(referral_walk.path) AS cycle,
        referral_walk.depth + 1
      FROM referral_walk
      JOIN public.users AS next_user
        ON next_user.referral_code = referral_walk.referred_by_code
      WHERE NOT referral_walk.cycle
        AND referral_walk.referred_by_code IS NOT NULL
        AND referral_walk.depth < 64
    )
    SELECT 1
    FROM referral_walk
    WHERE cycle
      OR (depth >= 64 AND referred_by_code IS NOT NULL)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0038 found a cyclic or over-depth legacy referral graph; reconcile attribution explicitly before retrying',
      HINT = 'Do not grant credits or move referral evidence automatically.';
  END IF;
END $$;

DO $$
DECLARE
  expected_legacy_columns text[] := ARRAY[
    'created_at:timestamp without time zone:NO',
    'credit_cents:integer:NO',
    'event_type:text:NO',
    'id:integer:NO',
    'metadata:jsonb:YES',
    'referred_user_id:uuid:NO',
    'referrer_user_id:uuid:NO'
  ];
  expected_hardened_columns text[] := ARRAY[
    'created_at:timestamp without time zone:NO',
    'credit_cents:integer:NO',
    'event_type:text:NO',
    'id:integer:NO',
    'metadata:jsonb:YES',
    'referred_user_id:uuid:YES',
    'referrer_user_id:uuid:YES'
  ];
  actual_columns text[];
  default_count integer;
  id_default text;
  credit_default text;
  metadata_default text;
  created_default text;
BEGIN
  SELECT array_agg(
    column_name || ':' || data_type || ':' || is_nullable
    ORDER BY column_name
  )
  INTO actual_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'referral_events';

  IF actual_columns IS DISTINCT FROM expected_legacy_columns
    AND actual_columns IS DISTINCT FROM expected_hardened_columns
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format(
        '0038 found a non-canonical referral_events column shape: %s',
        coalesce(actual_columns::text, '<missing>')
      );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = 'public.referral_events'::regclass
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
      MESSAGE = '0038 refuses dropped/identity/generated/inherited/typmod referral columns';
  END IF;

  SELECT count(*)::integer,
    max(pg_get_expr(default_row.adbin, default_row.adrelid))
      FILTER (WHERE attribute.attname = 'id'),
    max(pg_get_expr(default_row.adbin, default_row.adrelid))
      FILTER (WHERE attribute.attname = 'credit_cents'),
    max(pg_get_expr(default_row.adbin, default_row.adrelid))
      FILTER (WHERE attribute.attname = 'metadata'),
    max(pg_get_expr(default_row.adbin, default_row.adrelid))
      FILTER (WHERE attribute.attname = 'created_at')
  INTO default_count, id_default, credit_default, metadata_default,
    created_default
  FROM pg_attrdef AS default_row
  JOIN pg_attribute AS attribute
    ON attribute.attrelid = default_row.adrelid
   AND attribute.attnum = default_row.adnum
  WHERE default_row.adrelid = 'public.referral_events'::regclass;

  IF default_count <> 4
    OR (
      id_default IS DISTINCT FROM
        'nextval(''referral_events_id_seq''::regclass)'
      AND id_default IS DISTINCT FROM
        'nextval(''public.referral_events_id_seq''::regclass)'
    )
    OR credit_default IS DISTINCT FROM '0'
    OR metadata_default IS DISTINCT FROM '''{}''::jsonb'
    OR created_default IS DISTINCT FROM 'now()'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format(
        '0038 found non-canonical referral defaults: count=%s id=%s credit=%s metadata=%s created=%s',
        default_count,
        coalesce(id_default, '<missing>'),
        coalesce(credit_default, '<missing>'),
        coalesce(metadata_default, '<missing>'),
        coalesce(created_default, '<missing>')
      );
  END IF;
END $$;

DO $$
DECLARE
  serial_sequence regclass;
  serial_dependency_count integer;
  id_attnum smallint;
  sequence_kind "char";
  sequence_persistence "char";
  sequence_owner oid;
  table_owner oid;
  constraint_count integer;
  canonical_primary_count integer;
  repairable_fk_count integer;
BEGIN
  SELECT attnum INTO id_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.referral_events'::regclass
    AND attname = 'id'
    AND NOT attisdropped;

  serial_sequence := pg_get_serial_sequence(
    'public.referral_events',
    'id'
  )::regclass;

  SELECT sequence_relation.relkind, sequence_relation.relpersistence,
    sequence_relation.relowner, table_relation.relowner
  INTO sequence_kind, sequence_persistence, sequence_owner, table_owner
  FROM pg_class AS table_relation
  LEFT JOIN pg_class AS sequence_relation
    ON sequence_relation.oid = to_regclass('public.referral_events_id_seq')
  WHERE table_relation.oid = 'public.referral_events'::regclass;

  SELECT count(*)::integer
  INTO serial_dependency_count
  FROM pg_depend AS dependency
  WHERE dependency.classid = 'pg_class'::regclass
    AND dependency.objid = serial_sequence
    AND dependency.refclassid = 'pg_class'::regclass
    AND dependency.refobjid = 'public.referral_events'::regclass
    AND dependency.refobjsubid = id_attnum
    AND dependency.deptype = 'a';

  IF serial_sequence IS DISTINCT FROM
      to_regclass('public.referral_events_id_seq')
    OR sequence_kind IS DISTINCT FROM 'S'::"char"
    OR sequence_persistence IS DISTINCT FROM 'p'::"char"
    OR sequence_owner IS DISTINCT FROM table_owner
    OR serial_dependency_count <> 1
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format(
        '0038 requires the canonical owned referral_events_id_seq; serial=%s kind=%s persistence=%s dependencies=%s',
        coalesce(serial_sequence::text, '<missing>'),
        coalesce(sequence_kind::text, '<missing>'),
        coalesce(sequence_persistence::text, '<missing>'),
        serial_dependency_count
      );
  END IF;

  SELECT count(*)::integer
  INTO constraint_count
  FROM pg_constraint
  WHERE conrelid = 'public.referral_events'::regclass;

  SELECT count(*)::integer
  INTO canonical_primary_count
  FROM pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = 'public.referral_events'::regclass
    AND constraint_row.conname = 'referral_events_pkey'
    AND constraint_row.contype = 'p'
    AND constraint_row.conkey = ARRAY[id_attnum]::smallint[]
    AND constraint_row.convalidated
    AND NOT constraint_row.condeferrable
    AND NOT constraint_row.condeferred
    AND NOT constraint_row.connoinherit
    AND constraint_row.conislocal
    AND constraint_row.coninhcount = 0
    AND constraint_row.conparentid = 0;

  SELECT count(*)::integer
  INTO repairable_fk_count
  FROM (VALUES
    ('referral_events_referrer_user_id_users_id_fk'::text,
      'referrer_user_id'::text),
    ('referral_events_referred_user_id_users_id_fk', 'referred_user_id')
  ) AS expected(constraint_name, source_column)
  JOIN pg_constraint AS constraint_row
    ON constraint_row.conrelid = 'public.referral_events'::regclass
   AND constraint_row.conname = expected.constraint_name
   AND constraint_row.contype = 'f'
   AND constraint_row.confrelid = 'public.users'::regclass
   AND constraint_row.confupdtype = 'a'
   AND constraint_row.confdeltype IN ('c', 'n')
   AND constraint_row.confmatchtype = 's'
   AND constraint_row.convalidated
   AND NOT constraint_row.connoinherit
   AND NOT constraint_row.condeferrable
   AND NOT constraint_row.condeferred
   AND constraint_row.conislocal
   AND constraint_row.coninhcount = 0
   AND constraint_row.conparentid = 0
  JOIN pg_attribute AS source_attribute
    ON source_attribute.attrelid = constraint_row.conrelid
   AND source_attribute.attname = expected.source_column
   AND constraint_row.conkey = ARRAY[source_attribute.attnum]::smallint[]
  JOIN pg_attribute AS target_attribute
    ON target_attribute.attrelid = constraint_row.confrelid
   AND target_attribute.attname = 'id'
   AND constraint_row.confkey = ARRAY[target_attribute.attnum]::smallint[];

  IF constraint_count <> 3
    OR canonical_primary_count <> 1
    OR repairable_fk_count <> 2
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format(
        '0038 requires the exact referral primary/FK constraints; count=%s primary=%s foreign=%s',
        constraint_count,
        canonical_primary_count,
        repairable_fk_count
      );
  END IF;
END $$;

-- The three legacy indexes are invariants, not repair targets. The milestone
-- index may be absent or safely drifted on this table because it is rebuilt
-- below. Any other index or a same-name object elsewhere is ambiguous and
-- fails closed before the ledger shape is changed.
DO $$
DECLARE
  expected record;
  canonical_count integer;
  index_count integer;
  unexpected_indexes text[];
  existing_kind "char";
  indexed_table oid;
BEGIN
  SELECT relation.relkind, index_catalog.indrelid
  INTO existing_kind, indexed_table
  FROM pg_class AS relation
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  LEFT JOIN pg_index AS index_catalog ON index_catalog.indexrelid = relation.oid
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'referral_events_milestone_uidx';

  IF existing_kind IS NOT NULL AND (
    existing_kind NOT IN ('i'::"char", 'I'::"char")
    OR indexed_table IS DISTINCT FROM 'public.referral_events'::regclass
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0038 refuses a same-name object not indexing public.referral_events';
  END IF;

  SELECT count(*)::integer,
    array_agg(index_relation.relname ORDER BY index_relation.relname)
      FILTER (
        WHERE index_relation.relname NOT IN (
          'referral_events_pkey',
          'idx_referral_referrer',
          'idx_referral_referred',
          'referral_events_milestone_uidx'
        )
      )
  INTO index_count, unexpected_indexes
  FROM pg_index AS index_catalog
  JOIN pg_class AS index_relation
    ON index_relation.oid = index_catalog.indexrelid
  WHERE index_catalog.indrelid = 'public.referral_events'::regclass;

  IF index_count NOT IN (3, 4) OR unexpected_indexes IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format(
        '0038 found non-canonical referral indexes: count=%s unexpected=%s',
        index_count,
        coalesce(unexpected_indexes::text, '<none>')
      );
  END IF;

  FOR expected IN
    SELECT * FROM (VALUES
      (
        'referral_events_pkey'::text,
        ARRAY['id']::text[],
        ARRAY['int4_ops']::text[],
        true,
        true,
        1
      ),
      (
        'idx_referral_referrer',
        ARRAY['referrer_user_id', 'created_at']::text[],
        ARRAY['uuid_ops', 'timestamp_ops']::text[],
        false,
        false,
        0
      ),
      (
        'idx_referral_referred',
        ARRAY['referred_user_id']::text[],
        ARRAY['uuid_ops']::text[],
        false,
        false,
        0
      )
    ) AS required(
      index_name,
      column_names,
      opclass_names,
      is_unique,
      is_primary,
      constraint_backing_count
    )
  LOOP
    SELECT count(*)::integer
    INTO canonical_count
    FROM pg_index AS index_catalog
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_catalog.indexrelid
    JOIN pg_class AS table_relation
      ON table_relation.oid = index_catalog.indrelid
    JOIN pg_namespace AS namespace
      ON namespace.oid = index_relation.relnamespace
    JOIN pg_am AS access_method ON access_method.oid = index_relation.relam
    WHERE namespace.nspname = 'public'
      AND index_catalog.indrelid = 'public.referral_events'::regclass
      AND index_relation.relname = expected.index_name
      AND index_relation.relkind = 'i'
      AND index_relation.relpersistence = 'p'
      AND index_relation.relowner = table_relation.relowner
      AND index_relation.reltablespace = 0
      AND index_relation.reloptions IS NULL
      AND access_method.amname = 'btree'
      AND index_catalog.indisunique = expected.is_unique
      AND index_catalog.indisprimary = expected.is_primary
      AND NOT index_catalog.indisexclusion
      AND index_catalog.indimmediate
      AND index_catalog.indisvalid
      AND index_catalog.indisready
      AND index_catalog.indislive
      AND NOT index_catalog.indisclustered
      AND NOT index_catalog.indisreplident
      AND NOT index_catalog.indnullsnotdistinct
      AND index_catalog.indexprs IS NULL
      AND index_catalog.indpred IS NULL
      AND index_catalog.indnkeyatts = cardinality(expected.column_names)
      AND index_catalog.indnatts = cardinality(expected.column_names)
      AND ARRAY(
        SELECT attribute.attname::text
        FROM generate_series(0, index_catalog.indnkeyatts - 1)
          AS key_position(position)
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = index_catalog.indrelid
         AND attribute.attnum = index_catalog.indkey[key_position.position]
        ORDER BY key_position.position
      ) = expected.column_names
      AND ARRAY(
        SELECT operator_class.opcname::text
        FROM generate_series(0, index_catalog.indnkeyatts - 1)
          AS key_position(position)
        JOIN pg_opclass AS operator_class
          ON operator_class.oid = index_catalog.indclass[key_position.position]
        ORDER BY key_position.position
      ) = expected.opclass_names
      AND NOT EXISTS (
        SELECT 1
        FROM generate_series(0, index_catalog.indnkeyatts - 1)
          AS key_position(position)
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = index_catalog.indrelid
         AND attribute.attnum = index_catalog.indkey[key_position.position]
        JOIN pg_opclass AS operator_class
          ON operator_class.oid = index_catalog.indclass[key_position.position]
        WHERE index_catalog.indoption[key_position.position] <> 0
          OR index_catalog.indcollation[key_position.position]
            IS DISTINCT FROM attribute.attcollation
          OR NOT operator_class.opcdefault
          OR operator_class.opcmethod <> access_method.oid
          OR operator_class.opcintype <> attribute.atttypid
      )
      AND (
        SELECT count(*)::integer
        FROM pg_constraint AS constraint_row
        WHERE constraint_row.conindid = index_catalog.indexrelid
      ) = expected.constraint_backing_count;

    IF canonical_count <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = format(
          '0038 requires canonical legacy referral index %I',
          expected.index_name
        );
    END IF;
  END LOOP;
END $$;

-- Preserve ledger evidence when either account is erased. Only the two
-- identifying links are minimized. Named legacy CASCADE FKs or a previous
-- canonical SET NULL application are accepted; every other constraint shape
-- was rejected above before this repair begins.
ALTER TABLE public.referral_events
  DROP CONSTRAINT referral_events_referrer_user_id_users_id_fk,
  DROP CONSTRAINT referral_events_referred_user_id_users_id_fk;

ALTER TABLE public.referral_events
  ALTER COLUMN referrer_user_id DROP NOT NULL,
  ALTER COLUMN referred_user_id DROP NOT NULL;

ALTER TABLE public.referral_events
  ADD CONSTRAINT referral_events_referrer_user_id_users_id_fk
    FOREIGN KEY (referrer_user_id) REFERENCES public.users(id)
    ON DELETE SET NULL,
  ADD CONSTRAINT referral_events_referred_user_id_users_id_fk
    FOREIGN KEY (referred_user_id) REFERENCES public.users(id)
    ON DELETE SET NULL;

DO $$
DECLARE
  canonical_fk_count integer;
BEGIN
  SELECT count(*)::integer
  INTO canonical_fk_count
  FROM (VALUES
    ('referral_events_referrer_user_id_users_id_fk'::text,
      'referrer_user_id'::text),
    ('referral_events_referred_user_id_users_id_fk', 'referred_user_id')
  ) AS expected(constraint_name, source_column)
  JOIN pg_constraint AS constraint_row
    ON constraint_row.conrelid = 'public.referral_events'::regclass
   AND constraint_row.conname = expected.constraint_name
   AND constraint_row.contype = 'f'
   AND constraint_row.confrelid = 'public.users'::regclass
   AND constraint_row.confupdtype = 'a'
   AND constraint_row.confdeltype = 'n'
   AND constraint_row.confmatchtype = 's'
   AND constraint_row.convalidated
   AND NOT constraint_row.connoinherit
   AND NOT constraint_row.condeferrable
   AND NOT constraint_row.condeferred
   AND constraint_row.conislocal
   AND constraint_row.coninhcount = 0
   AND constraint_row.conparentid = 0
  JOIN pg_attribute AS source_attribute
    ON source_attribute.attrelid = constraint_row.conrelid
   AND source_attribute.attname = expected.source_column
   AND NOT source_attribute.attnotnull
   AND constraint_row.conkey = ARRAY[source_attribute.attnum]::smallint[]
  JOIN pg_attribute AS target_attribute
    ON target_attribute.attrelid = constraint_row.confrelid
   AND target_attribute.attname = 'id'
   AND constraint_row.confkey = ARRAY[target_attribute.attnum]::smallint[];

  IF canonical_fk_count <> 2 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0038 failed to install both nullable ON DELETE SET NULL referral foreign keys';
  END IF;
END $$;

-- Abort while holding the writer lock if historical evidence already contains
-- a duplicate. Never pick a winner and never mutate credit/evidence rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.referral_events
    WHERE referrer_user_id IS NOT NULL
      AND referred_user_id IS NOT NULL
    GROUP BY referrer_user_id, referred_user_id, event_type
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = '0038 found duplicate referral milestones; reconcile credits explicitly before retrying',
      HINT = 'Do not delete, merge, or adjust referral evidence automatically.';
  END IF;
END $$;

-- Minimize legacy metadata while the ledger writer is fenced. The referral
-- identities and financial facts live in typed columns; arbitrary JSON such
-- as booking dates/entity ids is neither required evidence nor safe to retain
-- after account erasure. Preserve only the known non-identifying reconciler
-- marker and never alter event type, amount, parties, or timestamps.
UPDATE public.referral_events
SET metadata = CASE
  WHEN jsonb_typeof(metadata) = 'object'
    AND metadata ->> 'recoveredBy' = 'onboarding_reconciler'
  THEN jsonb_build_object('recoveredBy', 'onboarding_reconciler')
  ELSE '{}'::jsonb
END
WHERE metadata IS DISTINCT FROM CASE
  WHEN jsonb_typeof(metadata) = 'object'
    AND metadata ->> 'recoveredBy' = 'onboarding_reconciler'
  THEN jsonb_build_object('recoveredBy', 'onboarding_reconciler')
  ELSE '{}'::jsonb
END;

-- A same-name index attached to another table is not ours to drop.
DO $$
DECLARE
  existing_kind "char";
  indexed_table oid;
BEGIN
  SELECT relation.relkind, index_catalog.indrelid
  INTO existing_kind, indexed_table
  FROM pg_class AS relation
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  LEFT JOIN pg_index AS index_catalog ON index_catalog.indexrelid = relation.oid
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'referral_events_milestone_uidx';

  IF existing_kind IS NOT NULL AND (
    existing_kind NOT IN ('i'::"char", 'I'::"char")
    OR indexed_table IS DISTINCT FROM 'public.referral_events'::regclass
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0038 refuses a same-name object not indexing public.referral_events';
  END IF;
END $$;

DROP INDEX IF EXISTS public.referral_events_milestone_uidx;
CREATE UNIQUE INDEX referral_events_milestone_uidx
  ON public.referral_events USING btree
  (referrer_user_id, referred_user_id, event_type);

DO $$
DECLARE
  referrer_attnum smallint;
  referred_attnum smallint;
  event_type_attnum smallint;
  canonical_count integer;
BEGIN
  SELECT attnum INTO referrer_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.referral_events'::regclass
    AND attname = 'referrer_user_id' AND NOT attisdropped;
  SELECT attnum INTO referred_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.referral_events'::regclass
    AND attname = 'referred_user_id' AND NOT attisdropped;
  SELECT attnum INTO event_type_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.referral_events'::regclass
    AND attname = 'event_type' AND NOT attisdropped;

  SELECT count(*)::integer
  INTO canonical_count
  FROM pg_index AS index_catalog
  JOIN pg_class AS index_relation
    ON index_relation.oid = index_catalog.indexrelid
  JOIN pg_class AS table_relation
    ON table_relation.oid = index_catalog.indrelid
  JOIN pg_namespace AS namespace ON namespace.oid = index_relation.relnamespace
  JOIN pg_am AS access_method ON access_method.oid = index_relation.relam
  WHERE namespace.nspname = 'public'
    AND index_catalog.indrelid = 'public.referral_events'::regclass
    AND index_relation.relname = 'referral_events_milestone_uidx'
    AND index_relation.relkind = 'i'
    AND index_relation.relpersistence = 'p'
    AND index_relation.relowner = table_relation.relowner
    AND index_relation.reltablespace = 0
    AND index_relation.reloptions IS NULL
    AND access_method.amname = 'btree'
    AND index_catalog.indisunique
    AND NOT index_catalog.indisprimary
    AND NOT index_catalog.indisexclusion
    AND index_catalog.indimmediate
    AND index_catalog.indisvalid
    AND index_catalog.indisready
    AND index_catalog.indislive
    AND NOT index_catalog.indisclustered
    AND NOT index_catalog.indisreplident
    AND NOT index_catalog.indnullsnotdistinct
    AND index_catalog.indexprs IS NULL
    AND index_catalog.indpred IS NULL
    AND index_catalog.indnkeyatts = 3
    AND index_catalog.indnatts = 3
    AND index_catalog.indkey[0] = referrer_attnum
    AND index_catalog.indkey[1] = referred_attnum
    AND index_catalog.indkey[2] = event_type_attnum
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_row
      WHERE constraint_row.conindid = index_catalog.indexrelid
    )
    AND NOT EXISTS (
      SELECT 1
      FROM generate_series(0, index_catalog.indnkeyatts - 1)
        AS key_position(position)
      JOIN pg_attribute AS attribute
        ON attribute.attrelid = index_catalog.indrelid
       AND attribute.attnum = index_catalog.indkey[key_position.position]
      JOIN pg_opclass AS operator_class
        ON operator_class.oid = index_catalog.indclass[key_position.position]
      WHERE index_catalog.indoption[key_position.position] <> 0
        OR index_catalog.indcollation[key_position.position]
          IS DISTINCT FROM attribute.attcollation
        OR NOT operator_class.opcdefault
        OR operator_class.opcmethod <> access_method.oid
        OR operator_class.opcintype <> attribute.atttypid
    );

  IF canonical_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0038 failed to install the exact unique btree referral milestone arbiter';
  END IF;
END $$;

-- This ledger has no supported browser workflow. Remove every policy so a
-- later accidental GRANT cannot turn a stale policy into data exposure.
DO $$
DECLARE
  policy_name text;
BEGIN
  FOR policy_name IN
    SELECT polname
    FROM pg_policy
    WHERE polrelid = 'public.referral_events'::regclass
    ORDER BY polname
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON public.referral_events',
      policy_name
    );
  END LOOP;
END $$;

ALTER TABLE public.referral_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_events NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  inherited_role text;
  column_list text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
  INTO column_list
  FROM pg_attribute
  WHERE attrelid = 'public.referral_events'::regclass
    AND attnum > 0
    AND NOT attisdropped;

  REVOKE ALL PRIVILEGES ON TABLE public.referral_events FROM PUBLIC;
  EXECUTE format(
    'REVOKE ALL PRIVILEGES (%s) ON TABLE public.referral_events FROM PUBLIC',
    column_list
  );
  REVOKE ALL PRIVILEGES ON SEQUENCE public.referral_events_id_seq FROM PUBLIC;

  FOR inherited_role IN
    WITH RECURSIVE browser_role_tree(role_oid, role_name) AS (
      SELECT oid, rolname
      FROM pg_roles
      WHERE rolname IN ('anon', 'authenticated')
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
      'REVOKE ALL PRIVILEGES ON TABLE public.referral_events FROM %I',
      inherited_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.referral_events FROM %I',
      column_list,
      inherited_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON SEQUENCE public.referral_events_id_seq FROM %I',
      inherited_role
    );
  END LOOP;
END $$;

DO $$
DECLARE
  audited_role text;
  column_name text;
  privilege_name text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = 'public.referral_events'::regclass
      AND (NOT relrowsecurity OR relforcerowsecurity)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0038 failed to enable owner-compatible referral RLS';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.referral_events'::regclass
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0038 found a policy on the server-only referral ledger';
  END IF;

  FOR audited_role IN
    WITH RECURSIVE browser_role_tree(role_oid, role_name) AS (
      SELECT oid, rolname
      FROM pg_roles
      WHERE rolname IN ('anon', 'authenticated')
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
    FOR privilege_name IN
      SELECT DISTINCT supported_privilege.privilege_type
      FROM pg_class AS target_relation
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        pg_catalog.acldefault('r', target_relation.relowner)
      ) AS supported_privilege
      WHERE target_relation.oid = 'public.referral_events'::regclass
      ORDER BY supported_privilege.privilege_type
    LOOP
      IF has_table_privilege(
        audited_role,
        'public.referral_events',
        privilege_name
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = format(
            '0038 found effective %s privilege for %s on referral_events',
            privilege_name,
            audited_role
          );
      END IF;
    END LOOP;

    FOR column_name IN
      SELECT attname
      FROM pg_attribute
      WHERE attrelid = 'public.referral_events'::regclass
        AND attnum > 0
        AND NOT attisdropped
      ORDER BY attnum
    LOOP
      FOREACH privilege_name IN ARRAY ARRAY[
        'SELECT', 'INSERT', 'UPDATE', 'REFERENCES'
      ] LOOP
        IF has_column_privilege(
          audited_role,
          'public.referral_events',
          column_name,
          privilege_name
        ) THEN
          RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = format(
              '0038 found effective %s privilege for %s on referral column %s',
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
      WHERE target_sequence.oid = 'public.referral_events_id_seq'::regclass
      ORDER BY supported_privilege.privilege_type
    LOOP
      IF has_sequence_privilege(
        audited_role,
        'public.referral_events_id_seq',
        privilege_name
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = format(
            '0038 found effective sequence %s privilege for %s',
            privilege_name,
            audited_role
          );
      END IF;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
