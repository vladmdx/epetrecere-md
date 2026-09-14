-- 0036 — One-time server authorization for exact AI booking proposals.
--
-- The browser/model never authorizes a mutation through chat history alone.
-- A random token is stored only as SHA-256 and can be consumed for one exact
-- user/plan/artist/category/payload/action tuple before expiry.
--
-- This table is server-only. RLS remains owner-compatible because the trusted
-- postgres.js runtime uses the table owner; browser roles instead have zero
-- effective table, column, and sequence privileges and there are no policies.
-- Do not apply to Preview/Production without an explicit rollout.

BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DO $$
DECLARE
  required_relation text;
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
      MESSAGE = '0036 requires the Supabase anon and authenticated roles';
  END IF;

  FOREACH required_relation IN ARRAY ARRAY[
    'users', 'event_plans', 'artists', 'categories',
    'account_erasure_identity_outbox'
  ] LOOP
    SELECT relation.relkind
    INTO relation_kind
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = required_relation;

    IF relation_kind IS DISTINCT FROM 'r'::"char" THEN
      RAISE EXCEPTION USING
        ERRCODE = '42P01',
        MESSAGE = format(
          '0036 requires canonical post-0035 ordinary table public.%I; relkind=%s',
          required_relation,
          coalesce(relation_kind::text, '<missing>')
        );
    END IF;
  END LOOP;

  SELECT relation.relkind, relation.relpersistence, relation.relispartition,
    relation.oid
  INTO relation_kind, relation_persistence, relation_is_partition, relation_oid
  FROM pg_class AS relation
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname = 'ai_booking_proposals';

  IF relation_kind IS NOT NULL AND (
    relation_kind <> 'r'::"char"
    OR relation_persistence <> 'p'::"char"
    OR relation_is_partition
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42809',
      MESSAGE = format(
        '0036 requires ai_booking_proposals to be a permanent, non-partition ordinary table; relkind=%s persistence=%s partition=%s',
        relation_kind::text,
        relation_persistence::text,
        relation_is_partition::text
      );
  END IF;

  IF relation_kind IS NOT NULL AND EXISTS (
    SELECT 1
    FROM pg_inherits
    WHERE inhrelid = relation_oid OR inhparent = relation_oid
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0036 refuses an inherited or partition-parent proposal table';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.ai_booking_proposals (
  id serial PRIMARY KEY,
  token_hash text NOT NULL,
  payload_hash text NOT NULL,
  user_id uuid NOT NULL,
  event_plan_id integer NOT NULL,
  artist_id integer NOT NULL,
  category_id integer NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_action_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_booking_proposals_user_fk
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT ai_booking_proposals_event_plan_fk
    FOREIGN KEY (event_plan_id) REFERENCES public.event_plans(id) ON DELETE CASCADE,
  CONSTRAINT ai_booking_proposals_artist_fk
    FOREIGN KEY (artist_id) REFERENCES public.artists(id) ON DELETE CASCADE,
  CONSTRAINT ai_booking_proposals_category_fk
    FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE,
  CONSTRAINT ai_booking_proposals_consumption_shape_chk CHECK (
    (consumed_at IS NULL AND consumed_action_id IS NULL)
    OR (consumed_at IS NOT NULL AND consumed_action_id IS NOT NULL)
  )
);

-- Freeze catalog state before validating a pre-existing object or repairing
-- safe drift. A lookalike never gets columns/defaults/keys rewritten silently.
LOCK TABLE public.ai_booking_proposals IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  expected_columns text[] := ARRAY[
    'artist_id:integer:NO',
    'category_id:integer:NO',
    'consumed_action_id:uuid:YES',
    'consumed_at:timestamp with time zone:YES',
    'created_at:timestamp with time zone:NO',
    'event_plan_id:integer:NO',
    'expires_at:timestamp with time zone:NO',
    'id:integer:NO',
    'payload_hash:text:NO',
    'token_hash:text:NO',
    'user_id:uuid:NO'
  ];
  actual_columns text[];
  default_count integer;
  id_default text;
  created_default text;
BEGIN
  SELECT array_agg(
    column_name || ':' || data_type || ':' || is_nullable
    ORDER BY column_name
  )
  INTO actual_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'ai_booking_proposals';

  IF actual_columns IS DISTINCT FROM expected_columns THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format(
        '0036 found a non-canonical ai_booking_proposals column shape: %s',
        coalesce(actual_columns::text, '<missing>')
      );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = 'public.ai_booking_proposals'::regclass
      AND attribute.attnum > 0
      AND (
        attribute.attisdropped
        OR (
          attribute.attidentity <> ''
          OR attribute.attgenerated <> ''
          OR attribute.atttypmod <> -1
          OR attribute.attinhcount <> 0
          OR NOT attribute.attislocal
        )
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0036 does not accept dropped/identity/generated/inherited/typmod proposal columns';
  END IF;

  SELECT count(*)::integer,
    max(pg_get_expr(default_row.adbin, default_row.adrelid))
      FILTER (WHERE attribute.attname = 'id'),
    max(pg_get_expr(default_row.adbin, default_row.adrelid))
      FILTER (WHERE attribute.attname = 'created_at')
  INTO default_count, id_default, created_default
  FROM pg_attrdef AS default_row
  JOIN pg_attribute AS attribute
    ON attribute.attrelid = default_row.adrelid
   AND attribute.attnum = default_row.adnum
  WHERE default_row.adrelid = 'public.ai_booking_proposals'::regclass;

  IF default_count <> 2
    OR (
      id_default IS DISTINCT FROM
        'nextval(''ai_booking_proposals_id_seq''::regclass)'
      AND id_default IS DISTINCT FROM
        'nextval(''public.ai_booking_proposals_id_seq''::regclass)'
    )
    OR created_default IS DISTINCT FROM 'now()'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format(
        '0036 found non-canonical defaults: count=%s id=%s created_at=%s',
        default_count,
        coalesce(id_default, '<missing>'),
        coalesce(created_default, '<missing>')
      );
  END IF;
END $$;

DO $$
DECLARE
  serial_sequence regclass;
  serial_dependency_count integer;
  id_attnum smallint;
  primary_count integer;
  canonical_primary_count integer;
  canonical_primary_index_count integer;
BEGIN
  serial_sequence := pg_get_serial_sequence(
    'public.ai_booking_proposals',
    'id'
  )::regclass;
  IF serial_sequence IS DISTINCT FROM
      to_regclass('public.ai_booking_proposals_id_seq') THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format(
        '0036 requires id to own ai_booking_proposals_id_seq; found %s',
        coalesce(serial_sequence::text, '<none>')
      );
  END IF;

  SELECT attnum INTO id_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.ai_booking_proposals'::regclass
    AND attname = 'id'
    AND NOT attisdropped;

  SELECT count(*)::integer
  INTO serial_dependency_count
  FROM pg_depend AS dependency
  WHERE dependency.classid = 'pg_class'::regclass
    AND dependency.objid = serial_sequence
    AND dependency.refclassid = 'pg_class'::regclass
    AND dependency.refobjid = 'public.ai_booking_proposals'::regclass
    AND dependency.refobjsubid = id_attnum
    AND dependency.deptype = 'a';

  IF serial_dependency_count <> 1 OR EXISTS (
    SELECT 1
    FROM pg_class AS sequence_relation
    JOIN pg_class AS table_relation
      ON table_relation.oid = 'public.ai_booking_proposals'::regclass
    WHERE sequence_relation.oid = serial_sequence
      AND (
        sequence_relation.relkind <> 'S'
        OR sequence_relation.relpersistence <> 'p'
        OR sequence_relation.relowner <> table_relation.relowner
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0036 found non-canonical serial sequence ownership';
  END IF;

  SELECT count(*)::integer,
    count(*) FILTER (
      WHERE conname = 'ai_booking_proposals_pkey'
        AND conkey = ARRAY[id_attnum]::smallint[]
        AND convalidated
        AND NOT condeferrable
        AND NOT condeferred
        AND conislocal
        AND coninhcount = 0
        AND conparentid = 0
        AND NOT connoinherit
    )::integer
  INTO primary_count, canonical_primary_count
  FROM pg_constraint
  WHERE conrelid = 'public.ai_booking_proposals'::regclass
    AND contype = 'p';

  IF primary_count <> 1 OR canonical_primary_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0036 requires exactly one canonical primary key on id';
  END IF;

  SELECT count(*)::integer
  INTO canonical_primary_index_count
  FROM pg_constraint AS primary_constraint
  JOIN pg_index AS index_catalog
    ON index_catalog.indexrelid = primary_constraint.conindid
  JOIN pg_class AS index_relation
    ON index_relation.oid = index_catalog.indexrelid
  JOIN pg_namespace AS index_namespace
    ON index_namespace.oid = index_relation.relnamespace
  JOIN pg_class AS table_relation
    ON table_relation.oid = index_catalog.indrelid
  JOIN pg_am AS access_method
    ON access_method.oid = index_relation.relam
  JOIN pg_attribute AS id_attribute
    ON id_attribute.attrelid = index_catalog.indrelid
   AND id_attribute.attnum = id_attnum
  JOIN pg_opclass AS operator_class
    ON operator_class.oid = index_catalog.indclass[0]
  WHERE primary_constraint.conrelid =
      'public.ai_booking_proposals'::regclass
    AND primary_constraint.contype = 'p'
    AND primary_constraint.conname = 'ai_booking_proposals_pkey'
    AND index_namespace.nspname = 'public'
    AND index_relation.relname = 'ai_booking_proposals_pkey'
    AND index_relation.relkind = 'i'
    AND index_relation.relowner = table_relation.relowner
    AND access_method.amname = 'btree'
    AND index_catalog.indisunique
    AND index_catalog.indisprimary
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
    AND index_catalog.indnkeyatts = 1
    AND index_catalog.indnatts = 1
    AND index_catalog.indkey[0] = id_attnum
    AND operator_class.opcname = 'int4_ops'
    AND operator_class.opcdefault
    AND operator_class.opcmethod = access_method.oid
    AND operator_class.opcintype = id_attribute.atttypid
    AND index_catalog.indcollation[0] = id_attribute.attcollation
    AND index_catalog.indoption[0] = 0
    AND index_relation.reltablespace = 0
    AND index_relation.reloptions IS NULL;

  IF canonical_primary_index_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0036 requires the canonical btree primary index on id';
  END IF;
END $$;

DO $$
DECLARE
  target record;
  source_attnum smallint;
  target_attnum smallint;
  related_count integer;
  canonical_count integer;
  foreign_key_count integer;
BEGIN
  SELECT count(*)::integer
  INTO foreign_key_count
  FROM pg_constraint
  WHERE conrelid = 'public.ai_booking_proposals'::regclass
    AND contype = 'f';
  IF foreign_key_count <> 4 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format(
        '0036 requires exactly four proposal foreign keys; found %s',
        foreign_key_count
      );
  END IF;

  FOR target IN
    SELECT * FROM (VALUES
      ('user_id', 'ai_booking_proposals_user_fk', 'public.users'),
      ('event_plan_id', 'ai_booking_proposals_event_plan_fk', 'public.event_plans'),
      ('artist_id', 'ai_booking_proposals_artist_fk', 'public.artists'),
      ('category_id', 'ai_booking_proposals_category_fk', 'public.categories')
    ) AS expected(source_column, constraint_name, target_table)
  LOOP
    SELECT attnum INTO source_attnum
    FROM pg_attribute
    WHERE attrelid = 'public.ai_booking_proposals'::regclass
      AND attname = target.source_column
      AND NOT attisdropped;
    SELECT attnum INTO target_attnum
    FROM pg_attribute
    WHERE attrelid = target.target_table::regclass
      AND attname = 'id'
      AND NOT attisdropped;

    SELECT count(*)::integer,
      count(*) FILTER (
        WHERE conname = target.constraint_name
          AND conkey = ARRAY[source_attnum]::smallint[]
          AND confrelid = target.target_table::regclass
          AND confkey = ARRAY[target_attnum]::smallint[]
          AND confdeltype = 'c'
          AND confupdtype = 'a'
          AND confmatchtype = 's'
          AND convalidated
          AND NOT connoinherit
          AND NOT condeferrable
          AND NOT condeferred
          AND conislocal
          AND coninhcount = 0
          AND conparentid = 0
      )::integer
    INTO related_count, canonical_count
    FROM pg_constraint
    WHERE conrelid = 'public.ai_booking_proposals'::regclass
      AND contype = 'f'
      AND source_attnum = ANY(conkey);

    IF related_count <> 1 OR canonical_count <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = format(
          '0036 found a non-canonical foreign key for %s',
          target.source_column
        );
    END IF;
  END LOOP;
END $$;

-- The single named CHECK is safe to rebuild. Unexpected additional CHECKs are
-- rejected because silently dropping them could weaken an unknown invariant.
DO $$
DECLARE
  unexpected_checks text[];
BEGIN
  SELECT array_agg(conname ORDER BY conname)
  INTO unexpected_checks
  FROM pg_constraint
  WHERE conrelid = 'public.ai_booking_proposals'::regclass
    AND contype = 'c'
    AND conname <> 'ai_booking_proposals_consumption_shape_chk';
  IF unexpected_checks IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format(
        '0036 refuses unexpected proposal CHECK constraints: %s',
        unexpected_checks::text
      );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.ai_booking_proposals'::regclass
      AND contype NOT IN ('p', 'f', 'c')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0036 refuses unexpected proposal constraint types';
  END IF;
END $$;

ALTER TABLE public.ai_booking_proposals
  DROP CONSTRAINT IF EXISTS ai_booking_proposals_consumption_shape_chk;
ALTER TABLE public.ai_booking_proposals
  ADD CONSTRAINT ai_booking_proposals_consumption_shape_chk CHECK (
    (consumed_at IS NULL AND consumed_action_id IS NULL)
    OR (consumed_at IS NOT NULL AND consumed_action_id IS NOT NULL)
  );

DO $$
DECLARE
  normalized_check text;
BEGIN
  SELECT regexp_replace(
    lower(pg_get_expr(conbin, conrelid)),
    '[[:space:]()]', '', 'g'
  )
  INTO normalized_check
  FROM pg_constraint
  WHERE conrelid = 'public.ai_booking_proposals'::regclass
    AND contype = 'c'
    AND conname = 'ai_booking_proposals_consumption_shape_chk'
    AND convalidated
    AND NOT connoinherit
    AND NOT condeferrable
    AND NOT condeferred
    AND conislocal
    AND coninhcount = 0
    AND conparentid = 0;

  IF normalized_check IS DISTINCT FROM
    'consumed_atisnullandconsumed_action_idisnullorconsumed_atisnotnullandconsumed_action_idisnotnull'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0036 failed to install the canonical consumption CHECK';
  END IF;
END $$;

-- Index definitions can be rebuilt safely and transactionally. Refuse an
-- identically named object attached anywhere else before dropping anything.
DO $$
DECLARE
  index_name text;
  existing_kind "char";
  indexed_table oid;
BEGIN
  FOREACH index_name IN ARRAY ARRAY[
    'ai_booking_proposals_token_hash_uidx',
    'ai_booking_proposals_expiry_idx',
    'ai_booking_proposals_user_plan_expiry_idx'
  ] LOOP
    SELECT relation.relkind, index_catalog.indrelid
    INTO existing_kind, indexed_table
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    LEFT JOIN pg_index AS index_catalog ON index_catalog.indexrelid = relation.oid
    WHERE namespace.nspname = 'public'
      AND relation.relname = index_name;

    IF existing_kind IS NOT NULL AND (
      existing_kind NOT IN ('i'::"char", 'I'::"char")
      OR indexed_table IS DISTINCT FROM
        'public.ai_booking_proposals'::regclass
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = format(
          '0036 refuses non-canonical named index object public.%I',
          index_name
        );
    END IF;
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.ai_booking_proposals_token_hash_uidx;
DROP INDEX IF EXISTS public.ai_booking_proposals_expiry_idx;
DROP INDEX IF EXISTS public.ai_booking_proposals_user_plan_expiry_idx;

CREATE UNIQUE INDEX ai_booking_proposals_token_hash_uidx
  ON public.ai_booking_proposals USING btree (token_hash);
CREATE INDEX ai_booking_proposals_expiry_idx
  ON public.ai_booking_proposals USING btree (expires_at);
CREATE INDEX ai_booking_proposals_user_plan_expiry_idx
  ON public.ai_booking_proposals USING btree
    (user_id, event_plan_id, expires_at);

DO $$
DECLARE
  expected record;
  canonical_count integer;
BEGIN
  FOR expected IN
    SELECT * FROM (VALUES
      (
        'ai_booking_proposals_token_hash_uidx',
        ARRAY['token_hash']::text[],
        ARRAY['text_ops']::text[],
        true
      ),
      (
        'ai_booking_proposals_expiry_idx',
        ARRAY['expires_at']::text[],
        ARRAY['timestamptz_ops']::text[],
        false
      ),
      (
        'ai_booking_proposals_user_plan_expiry_idx',
        ARRAY['user_id', 'event_plan_id', 'expires_at']::text[],
        ARRAY['uuid_ops', 'int4_ops', 'timestamptz_ops']::text[],
        false
      )
    ) AS specification(index_name, key_columns, opclasses, is_unique)
  LOOP
    SELECT count(*)::integer
    INTO canonical_count
    FROM pg_index AS index_catalog
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_catalog.indexrelid
    JOIN pg_namespace AS namespace
      ON namespace.oid = index_relation.relnamespace
    JOIN pg_am AS access_method
      ON access_method.oid = index_relation.relam
    JOIN pg_class AS table_relation
      ON table_relation.oid = index_catalog.indrelid
    WHERE namespace.nspname = 'public'
      AND index_relation.relname = expected.index_name
      AND index_relation.relkind = 'i'
      AND index_relation.relowner = table_relation.relowner
      AND index_catalog.indrelid = 'public.ai_booking_proposals'::regclass
      AND access_method.amname = 'btree'
      AND index_catalog.indisunique = expected.is_unique
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
      AND index_catalog.indnkeyatts = cardinality(expected.key_columns)
      AND index_catalog.indnatts = cardinality(expected.key_columns)
      AND index_relation.reltablespace = 0
      AND index_relation.reloptions IS NULL
      AND ARRAY(
        SELECT attribute.attname::text
        FROM generate_series(
          0,
          index_catalog.indnkeyatts - 1
        ) AS key_position(position)
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = index_catalog.indrelid
         AND attribute.attnum = index_catalog.indkey[key_position.position]
        ORDER BY key_position.position
      ) = expected.key_columns
      AND ARRAY(
        SELECT operator_class.opcname::text
        FROM generate_series(
          0,
          index_catalog.indnkeyatts - 1
        ) AS class_position(position)
        JOIN pg_opclass AS operator_class
          ON operator_class.oid = index_catalog.indclass[class_position.position]
        ORDER BY class_position.position
      ) = expected.opclasses
      AND NOT EXISTS (
        SELECT 1
        FROM generate_series(
          0,
          index_catalog.indnkeyatts - 1
        ) AS key_position(position)
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
        MESSAGE = format(
          '0036 failed to install canonical index %I',
          expected.index_name
        );
    END IF;
  END LOOP;
END $$;

-- A server-only table must never retain a permissive policy. Dropping policies
-- is safe here because no browser workflow is supported by this relation.
DO $$
DECLARE
  policy_name text;
BEGIN
  FOR policy_name IN
    SELECT polname
    FROM pg_policy
    WHERE polrelid = 'public.ai_booking_proposals'::regclass
    ORDER BY polname
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON public.ai_booking_proposals',
      policy_name
    );
  END LOOP;
END $$;

ALTER TABLE public.ai_booking_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_booking_proposals NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  inherited_role text;
  column_list text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
  INTO column_list
  FROM pg_attribute
  WHERE attrelid = 'public.ai_booking_proposals'::regclass
    AND attnum > 0
    AND NOT attisdropped;

  REVOKE ALL PRIVILEGES ON TABLE public.ai_booking_proposals FROM PUBLIC;
  EXECUTE format(
    'REVOKE ALL PRIVILEGES (%s) ON TABLE public.ai_booking_proposals FROM PUBLIC',
    column_list
  );
  REVOKE ALL PRIVILEGES ON SEQUENCE
    public.ai_booking_proposals_id_seq FROM PUBLIC;

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
      'REVOKE ALL PRIVILEGES ON TABLE public.ai_booking_proposals FROM %I',
      inherited_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.ai_booking_proposals FROM %I',
      column_list,
      inherited_role
    );
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON SEQUENCE public.ai_booking_proposals_id_seq FROM %I',
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
    WHERE oid = 'public.ai_booking_proposals'::regclass
      AND (NOT relrowsecurity OR relforcerowsecurity)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0036 failed to enable owner-compatible RLS';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.ai_booking_proposals'::regclass
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0036 found a policy on the server-only proposal table';
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
      WHERE target_relation.oid =
        'public.ai_booking_proposals'::regclass
      ORDER BY supported_privilege.privilege_type
    LOOP
      IF has_table_privilege(
        audited_role,
        'public.ai_booking_proposals',
        privilege_name
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = format(
            '0036 found effective %s privilege for %s on proposal table',
            privilege_name,
            audited_role
          );
      END IF;
    END LOOP;

    FOR column_name IN
      SELECT attname
      FROM pg_attribute
      WHERE attrelid = 'public.ai_booking_proposals'::regclass
        AND attnum > 0
        AND NOT attisdropped
      ORDER BY attnum
    LOOP
      FOREACH privilege_name IN ARRAY ARRAY[
        'SELECT', 'INSERT', 'UPDATE', 'REFERENCES'
      ] LOOP
        IF has_column_privilege(
          audited_role,
          'public.ai_booking_proposals',
          column_name,
          privilege_name
        ) THEN
          RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = format(
              '0036 found effective %s privilege for %s on proposal column %s',
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
        'public.ai_booking_proposals_id_seq'::regclass
      ORDER BY supported_privilege.privilege_type
    LOOP
      IF has_sequence_privilege(
        audited_role,
        'public.ai_booking_proposals_id_seq',
        privilege_name
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = format(
            '0036 found effective sequence %s privilege for %s',
            privilege_name,
            audited_role
          );
      END IF;
    END LOOP;
  END LOOP;
END $$;

COMMENT ON TABLE public.ai_booking_proposals IS
  'Server-only, short-lived exact authorization for one AI booking action.';
COMMENT ON COLUMN public.ai_booking_proposals.token_hash IS
  'SHA-256 digest of a random token; the raw token is returned once and never stored.';
COMMENT ON COLUMN public.ai_booking_proposals.payload_hash IS
  'SHA-256 digest of the complete canonical booking payload approved by the proposal.';

COMMIT;
