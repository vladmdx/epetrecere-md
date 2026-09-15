-- 0037 — Provenance registry, reference claims, and durable Blob erasure.
--
-- A database URL is never ownership evidence. Every new ePetrecere Blob is
-- registered by the server at upload time. Triggers record each live database
-- reference and serialize it with account erasure. Deletion is queued only
-- when the registered owner is the erased user and every claim disappears
-- with that same account. Legacy/unregistered URLs are retained fail-safe.
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
      MESSAGE = '0037 requires the Supabase anon and authenticated roles';
  END IF;
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42P01', MESSAGE = '0037 requires public.users';
  END IF;

  FOREACH relation_name IN ARRAY ARRAY[
    'users','categories','artists','artist_images','venues','venue_images',
    'reviews','blog_posts','booking_requests','chat_messages','event_plans',
    'event_photos','invitation_templates','invitations','conversations',
    'account_erasure_identity_outbox','ai_booking_proposals'
  ] LOOP
    SELECT relation.relkind, relation.relpersistence, relation.relispartition,
      relation.oid
    INTO relation_kind, relation_persistence, relation_is_partition,
      relation_oid
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relname = relation_name;
    IF relation_kind IS DISTINCT FROM 'r'::"char"
      OR relation_persistence IS DISTINCT FROM 'p'::"char"
      OR relation_is_partition IS DISTINCT FROM false
      OR EXISTS (
        SELECT 1 FROM pg_inherits
        WHERE inhrelid = relation_oid OR inhparent = relation_oid
      ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '42P01',
        MESSAGE = format(
          '0037 requires canonical post-0036 ordinary table public.%I',
          relation_name
        );
    END IF;
  END LOOP;

  FOREACH relation_name IN ARRAY ARRAY[
    'account_blob_assets',
    'account_blob_asset_claims',
    'account_asset_erasure_outbox'
  ] LOOP
    SELECT relation.relkind, relation.relpersistence,
      relation.relispartition, relation.oid
    INTO relation_kind, relation_persistence,
      relation_is_partition, relation_oid
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relname = relation_name;
    IF relation_kind IS NOT NULL AND (
      relation_kind <> 'r'::"char"
      OR relation_persistence <> 'p'::"char"
      OR relation_is_partition
      OR EXISTS (
        SELECT 1 FROM pg_inherits
        WHERE inhrelid = relation_oid OR inhparent = relation_oid
      )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = format(
          '0037 requires public.%s to be a permanent non-inherited ordinary table',
          relation_name
        );
    END IF;
  END LOOP;
END $$;

-- Trigger ownership derivation is part of the safety boundary. Refuse a
-- partial/older source schema instead of installing helpers that would later
-- guess at a missing or differently typed ownership column.
DO $$
DECLARE
  required record;
  actual_type text;
  actual_not_null boolean;
  actual_identity "char";
  actual_generated "char";
BEGIN
  FOR required IN
    SELECT * FROM (VALUES
      ('users','id','uuid',true), ('users','avatar_url','text',false),
      ('categories','id','integer',true), ('categories','image_url','text',false),
      ('artists','id','integer',true), ('artists','user_id','uuid',false),
      ('artists','photo_url','text',false), ('artists','video_testimonials','jsonb',false),
      ('artist_images','id','integer',true), ('artist_images','artist_id','integer',true),
      ('artist_images','url','text',true),
      ('venues','id','integer',true), ('venues','user_id','uuid',false),
      ('venues','organization_id','integer',false), ('venues','menu_url','text',false),
      ('venues','menu_pdf_url','text',false), ('venues','virtual_tour_url','text',false),
      ('venues','og_image_url','text',false), ('venues','video_testimonials','jsonb',false),
      ('venue_images','id','integer',true), ('venue_images','venue_id','integer',true),
      ('venue_images','url','text',true),
      ('reviews','id','integer',true), ('reviews','photos','jsonb',true),
      ('blog_posts','id','integer',true), ('blog_posts','cover_image_url','text',false),
      ('booking_requests','id','integer',true), ('booking_requests','contract_pdf_url','text',false),
      ('conversations','id','integer',true), ('conversations','client_user_id','uuid',true),
      ('chat_messages','id','integer',true), ('chat_messages','conversation_id','integer',false),
      ('chat_messages','attachment_url','text',false),
      ('event_plans','id','integer',true), ('event_plans','user_id','uuid',true),
      ('event_plans','moments_music_url','text',false),
      ('event_photos','id','integer',true), ('event_photos','plan_id','integer',true),
      ('event_photos','url','text',true),
      ('invitation_templates','id','integer',true),
      ('invitation_templates','thumbnail_url','text',false),
      ('invitations','id','integer',true), ('invitations','user_id','uuid',false),
      ('invitations','cover_image_url','text',false)
    ) AS expected(table_name, column_name, data_type, not_null)
  LOOP
    SELECT format_type(attribute.atttypid, attribute.atttypmod),
      attribute.attnotnull, attribute.attidentity, attribute.attgenerated
    INTO actual_type, actual_not_null, actual_identity, actual_generated
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = format('public.%I', required.table_name)::regclass
      AND attribute.attname = required.column_name
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped;
    IF actual_type IS DISTINCT FROM required.data_type
      OR actual_not_null IS DISTINCT FROM required.not_null
      OR actual_identity IS DISTINCT FROM ''::"char"
      OR actual_generated IS DISTINCT FROM ''::"char" THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = format(
          '0037 requires canonical source column public.%I.%I',
          required.table_name,
          required.column_name
        );
    END IF;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.account_blob_assets (
  asset_key text PRIMARY KEY,
  asset_url text,
  owner_user_id uuid,
  provenance text NOT NULL,
  erasure_policy text NOT NULL DEFAULT 'account_erasure',
  state text NOT NULL DEFAULT 'active',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_blob_assets_owner_user_fk
    FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT account_blob_assets_key_chk CHECK (asset_key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT account_blob_assets_provenance_chk CHECK (
    length(provenance) BETWEEN 1 AND 80
    AND provenance ~ '^[a-z0-9_:.-]+$'
  ),
  CONSTRAINT account_blob_assets_policy_chk
    CHECK (erasure_policy IN ('account_erasure', 'retain')),
  CONSTRAINT account_blob_assets_state_chk CHECK (
    (state = 'active' AND asset_url IS NOT NULL AND deleted_at IS NULL)
    OR
    (state = 'queued' AND asset_url IS NOT NULL AND owner_user_id IS NULL
      AND erasure_policy = 'account_erasure' AND deleted_at IS NULL)
    OR
    (state = 'deleted' AND asset_url IS NULL AND owner_user_id IS NULL AND deleted_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.account_blob_asset_claims (
  claim_key text PRIMARY KEY,
  asset_key text NOT NULL,
  erasure_user_id uuid,
  source_table text NOT NULL,
  source_id text NOT NULL,
  source_field text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_blob_asset_claims_asset_fk
    FOREIGN KEY (asset_key) REFERENCES public.account_blob_assets(asset_key) ON DELETE CASCADE,
  CONSTRAINT account_blob_asset_claims_erasure_user_fk
    FOREIGN KEY (erasure_user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT account_blob_asset_claims_identity_chk CHECK (
    length(claim_key) BETWEEN 1 AND 512
    AND length(source_table) BETWEEN 1 AND 64
    AND length(source_id) BETWEEN 1 AND 128
    AND length(source_field) BETWEEN 1 AND 64
  )
);

CREATE TABLE IF NOT EXISTS public.account_asset_erasure_outbox (
  id serial PRIMARY KEY,
  asset_key text NOT NULL,
  asset_url text,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_asset_erasure_outbox_asset_key_unique UNIQUE (asset_key),
  CONSTRAINT account_asset_erasure_outbox_registry_fk
    FOREIGN KEY (asset_key) REFERENCES public.account_blob_assets(asset_key) ON DELETE RESTRICT,
  CONSTRAINT account_asset_erasure_outbox_asset_key_chk
    CHECK (asset_key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT account_asset_erasure_outbox_status_chk
    CHECK (status IN ('pending', 'processing', 'failed', 'delivered')),
  CONSTRAINT account_asset_erasure_outbox_attempts_chk CHECK (attempts >= 0),
  CONSTRAINT account_asset_erasure_outbox_state_chk CHECK (
    (status = 'processing' AND asset_url IS NOT NULL AND lease_token IS NOT NULL
      AND lease_until IS NOT NULL AND delivered_at IS NULL)
    OR
    (status = 'delivered' AND asset_url IS NULL AND lease_token IS NULL
      AND lease_until IS NULL AND delivered_at IS NOT NULL)
    OR
    (status IN ('pending', 'failed') AND asset_url IS NOT NULL
      AND lease_token IS NULL AND lease_until IS NULL AND delivered_at IS NULL)
  )
);

LOCK TABLE public.account_blob_assets IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.account_blob_asset_claims IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.account_asset_erasure_outbox IN ACCESS EXCLUSIVE MODE;

-- Column/type/default drift is never guessed or silently widened.
DO $$
DECLARE
  actual jsonb;
  expected jsonb;
BEGIN
  IF (
    SELECT count(DISTINCT relation.relowner)
    FROM pg_class AS relation
    WHERE relation.oid IN (
      'public.account_blob_assets'::regclass,
      'public.account_blob_asset_claims'::regclass,
      'public.account_asset_erasure_outbox'::regclass
    )
  ) <> 1 OR EXISTS (
    SELECT 1
    FROM pg_class AS relation
    JOIN pg_roles AS owner_role ON owner_role.oid = relation.relowner
    WHERE relation.oid IN (
      'public.account_blob_assets'::regclass,
      'public.account_blob_asset_claims'::regclass,
      'public.account_asset_erasure_outbox'::regclass
    ) AND owner_role.rolname <> current_user
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0037 requires one current-user owner for every asset table';
  END IF;

  SELECT jsonb_object_agg(a.attname, jsonb_build_object(
    'type', format_type(a.atttypid, a.atttypmod),
    'not_null', a.attnotnull,
    'default', coalesce(pg_get_expr(d.adbin, d.adrelid), '')
  ) ORDER BY a.attnum)
  INTO actual
  FROM pg_attribute a
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attrelid = 'public.account_blob_assets'::regclass
    AND a.attnum > 0 AND NOT a.attisdropped;
  expected := jsonb_build_object(
    'asset_key', jsonb_build_object('type','text','not_null',true,'default',''),
    'asset_url', jsonb_build_object('type','text','not_null',false,'default',''),
    'owner_user_id', jsonb_build_object('type','uuid','not_null',false,'default',''),
    'provenance', jsonb_build_object('type','text','not_null',true,'default',''),
    'erasure_policy', jsonb_build_object('type','text','not_null',true,'default','''account_erasure''::text'),
    'state', jsonb_build_object('type','text','not_null',true,'default','''active''::text'),
    'deleted_at', jsonb_build_object('type','timestamp with time zone','not_null',false,'default',''),
    'created_at', jsonb_build_object('type','timestamp with time zone','not_null',true,'default','now()'),
    'updated_at', jsonb_build_object('type','timestamp with time zone','not_null',true,'default','now()')
  );
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '0037 account_blob_assets column/default drift';
  END IF;

  SELECT jsonb_object_agg(a.attname, jsonb_build_object(
    'type', format_type(a.atttypid, a.atttypmod),
    'not_null', a.attnotnull,
    'default', coalesce(pg_get_expr(d.adbin, d.adrelid), '')
  ) ORDER BY a.attnum)
  INTO actual
  FROM pg_attribute a
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attrelid = 'public.account_blob_asset_claims'::regclass
    AND a.attnum > 0 AND NOT a.attisdropped;
  expected := jsonb_build_object(
    'claim_key', jsonb_build_object('type','text','not_null',true,'default',''),
    'asset_key', jsonb_build_object('type','text','not_null',true,'default',''),
    'erasure_user_id', jsonb_build_object('type','uuid','not_null',false,'default',''),
    'source_table', jsonb_build_object('type','text','not_null',true,'default',''),
    'source_id', jsonb_build_object('type','text','not_null',true,'default',''),
    'source_field', jsonb_build_object('type','text','not_null',true,'default',''),
    'created_at', jsonb_build_object('type','timestamp with time zone','not_null',true,'default','now()')
  );
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '0037 account_blob_asset_claims column/default drift';
  END IF;

  SELECT jsonb_object_agg(a.attname, jsonb_build_object(
    'type', format_type(a.atttypid, a.atttypmod),
    'not_null', a.attnotnull,
    'default', coalesce(pg_get_expr(d.adbin, d.adrelid), '')
  ) ORDER BY a.attnum)
  INTO actual
  FROM pg_attribute a
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attrelid = 'public.account_asset_erasure_outbox'::regclass
    AND a.attnum > 0 AND NOT a.attisdropped;
  expected := jsonb_build_object(
    'id', jsonb_build_object('type','integer','not_null',true,'default','nextval(''account_asset_erasure_outbox_id_seq''::regclass)'),
    'asset_key', jsonb_build_object('type','text','not_null',true,'default',''),
    'asset_url', jsonb_build_object('type','text','not_null',false,'default',''),
    'status', jsonb_build_object('type','text','not_null',true,'default','''pending''::text'),
    'attempts', jsonb_build_object('type','integer','not_null',true,'default','0'),
    'next_attempt_at', jsonb_build_object('type','timestamp with time zone','not_null',true,'default','now()'),
    'lease_token', jsonb_build_object('type','uuid','not_null',false,'default',''),
    'lease_until', jsonb_build_object('type','timestamp with time zone','not_null',false,'default',''),
    'last_error', jsonb_build_object('type','text','not_null',false,'default',''),
    'delivered_at', jsonb_build_object('type','timestamp with time zone','not_null',false,'default',''),
    'created_at', jsonb_build_object('type','timestamp with time zone','not_null',true,'default','now()'),
    'updated_at', jsonb_build_object('type','timestamp with time zone','not_null',true,'default','now()')
  );
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '0037 account_asset_erasure_outbox column/default drift';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid IN (
      'public.account_blob_assets'::regclass,
      'public.account_blob_asset_claims'::regclass,
      'public.account_asset_erasure_outbox'::regclass
    )
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
      MESSAGE = '0037 refuses dropped/identity/generated/inherited/typmod asset columns';
  END IF;
END $$;

-- Named FKs and checks are repairable; validation fails closed on bad rows.
ALTER TABLE public.account_blob_asset_claims
  DROP CONSTRAINT IF EXISTS account_blob_asset_claims_asset_fk,
  DROP CONSTRAINT IF EXISTS account_blob_asset_claims_erasure_user_fk,
  DROP CONSTRAINT IF EXISTS account_blob_asset_claims_identity_chk;
ALTER TABLE public.account_blob_assets
  DROP CONSTRAINT IF EXISTS account_blob_assets_owner_user_fk,
  DROP CONSTRAINT IF EXISTS account_blob_assets_key_chk,
  DROP CONSTRAINT IF EXISTS account_blob_assets_provenance_chk,
  DROP CONSTRAINT IF EXISTS account_blob_assets_policy_chk,
  DROP CONSTRAINT IF EXISTS account_blob_assets_state_chk;
ALTER TABLE public.account_asset_erasure_outbox
  DROP CONSTRAINT IF EXISTS account_asset_erasure_outbox_registry_fk,
  DROP CONSTRAINT IF EXISTS account_asset_erasure_outbox_asset_key_chk,
  DROP CONSTRAINT IF EXISTS account_asset_erasure_outbox_status_chk,
  DROP CONSTRAINT IF EXISTS account_asset_erasure_outbox_attempts_chk,
  DROP CONSTRAINT IF EXISTS account_asset_erasure_outbox_state_chk;

ALTER TABLE public.account_blob_assets
  ADD CONSTRAINT account_blob_assets_owner_user_fk
    FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT account_blob_assets_key_chk CHECK (asset_key ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT account_blob_assets_provenance_chk CHECK (
    length(provenance) BETWEEN 1 AND 80 AND provenance ~ '^[a-z0-9_:.-]+$'
  ),
  ADD CONSTRAINT account_blob_assets_policy_chk
    CHECK (erasure_policy IN ('account_erasure', 'retain')),
  ADD CONSTRAINT account_blob_assets_state_chk CHECK (
    (state = 'active' AND asset_url IS NOT NULL AND deleted_at IS NULL)
    OR (state = 'queued' AND asset_url IS NOT NULL AND owner_user_id IS NULL
      AND erasure_policy = 'account_erasure' AND deleted_at IS NULL)
    OR (state = 'deleted' AND asset_url IS NULL AND owner_user_id IS NULL AND deleted_at IS NOT NULL)
  );
ALTER TABLE public.account_blob_asset_claims
  ADD CONSTRAINT account_blob_asset_claims_asset_fk
    FOREIGN KEY (asset_key) REFERENCES public.account_blob_assets(asset_key) ON DELETE CASCADE,
  ADD CONSTRAINT account_blob_asset_claims_erasure_user_fk
    FOREIGN KEY (erasure_user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  ADD CONSTRAINT account_blob_asset_claims_identity_chk CHECK (
    length(claim_key) BETWEEN 1 AND 512
    AND length(source_table) BETWEEN 1 AND 64
    AND length(source_id) BETWEEN 1 AND 128
    AND length(source_field) BETWEEN 1 AND 64
  );
ALTER TABLE public.account_asset_erasure_outbox
  ADD CONSTRAINT account_asset_erasure_outbox_registry_fk
    FOREIGN KEY (asset_key) REFERENCES public.account_blob_assets(asset_key) ON DELETE RESTRICT,
  ADD CONSTRAINT account_asset_erasure_outbox_asset_key_chk CHECK (asset_key ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT account_asset_erasure_outbox_status_chk
    CHECK (status IN ('pending', 'processing', 'failed', 'delivered')),
  ADD CONSTRAINT account_asset_erasure_outbox_attempts_chk CHECK (attempts >= 0),
  ADD CONSTRAINT account_asset_erasure_outbox_state_chk CHECK (
    (status = 'processing' AND asset_url IS NOT NULL AND lease_token IS NOT NULL
      AND lease_until IS NOT NULL AND delivered_at IS NULL)
    OR (status = 'delivered' AND asset_url IS NULL AND lease_token IS NULL
      AND lease_until IS NULL AND delivered_at IS NOT NULL)
    OR (status IN ('pending', 'failed') AND asset_url IS NOT NULL
      AND lease_token IS NULL AND lease_until IS NULL AND delivered_at IS NULL)
  );

DO $$
DECLARE
  relation_name text;
  actual_constraints text[];
  expected_constraints text[];
  serial_sequence regclass;
  serial_dependency_count integer;
  serial_shape_count integer;
  id_attnum smallint;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'account_blob_assets', 'account_blob_asset_claims', 'account_asset_erasure_outbox'
  ] LOOP
    SELECT array_agg(conname ORDER BY conname) INTO actual_constraints
    FROM pg_constraint
    WHERE conrelid = format('public.%I', relation_name)::regclass
      AND contype IN ('p', 'f', 'u', 'c');
    expected_constraints := CASE relation_name
      WHEN 'account_blob_assets' THEN ARRAY[
        'account_blob_assets_key_chk','account_blob_assets_owner_user_fk',
        'account_blob_assets_pkey','account_blob_assets_policy_chk',
        'account_blob_assets_provenance_chk','account_blob_assets_state_chk'
      ]
      WHEN 'account_blob_asset_claims' THEN ARRAY[
        'account_blob_asset_claims_asset_fk','account_blob_asset_claims_erasure_user_fk',
        'account_blob_asset_claims_identity_chk','account_blob_asset_claims_pkey'
      ]
      ELSE ARRAY[
        'account_asset_erasure_outbox_asset_key_chk',
        'account_asset_erasure_outbox_asset_key_unique',
        'account_asset_erasure_outbox_attempts_chk',
        'account_asset_erasure_outbox_pkey',
        'account_asset_erasure_outbox_registry_fk',
        'account_asset_erasure_outbox_state_chk',
        'account_asset_erasure_outbox_status_chk'
      ]
    END;
    SELECT array_agg(value ORDER BY value) INTO expected_constraints
    FROM unnest(expected_constraints) AS expected(value);
    IF actual_constraints IS DISTINCT FROM expected_constraints THEN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = format('0037 unexpected constraint drift on public.%s', relation_name);
    END IF;
  END LOOP;

  SELECT pg_get_serial_sequence('public.account_asset_erasure_outbox','id')::regclass
  INTO serial_sequence;
  IF serial_sequence IS DISTINCT FROM to_regclass('public.account_asset_erasure_outbox_id_seq') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '0037 requires the canonical outbox serial sequence';
  END IF;
  SELECT attnum INTO id_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.account_asset_erasure_outbox'::regclass
    AND attname = 'id' AND NOT attisdropped;
  SELECT count(*)::integer INTO serial_dependency_count
  FROM pg_depend AS dependency
  WHERE dependency.classid = 'pg_class'::regclass
    AND dependency.objid = serial_sequence
    AND dependency.refclassid = 'pg_class'::regclass
    AND dependency.refobjid = 'public.account_asset_erasure_outbox'::regclass
    AND dependency.refobjsubid = id_attnum
    AND dependency.deptype = 'a';
  SELECT count(*)::integer INTO serial_shape_count
    FROM pg_class AS sequence_relation
    JOIN pg_class AS table_relation
      ON table_relation.oid = 'public.account_asset_erasure_outbox'::regclass
    JOIN pg_sequence AS sequence_shape
      ON sequence_shape.seqrelid = sequence_relation.oid
    WHERE sequence_relation.oid = serial_sequence
      AND sequence_relation.relkind = 'S'
      AND sequence_relation.relpersistence = 'p'
      AND NOT sequence_relation.relispartition
      AND sequence_relation.relowner = table_relation.relowner
      AND sequence_relation.reltablespace = 0
      AND sequence_relation.reloptions IS NULL
      AND sequence_shape.seqtypid = 'integer'::regtype
      AND sequence_shape.seqstart = 1
      AND sequence_shape.seqincrement = 1
      AND sequence_shape.seqmax = 2147483647
      AND sequence_shape.seqmin = 1
      AND sequence_shape.seqcache = 1
      AND NOT sequence_shape.seqcycle
      AND NOT EXISTS (
        SELECT 1 FROM pg_inherits
        WHERE inhrelid = sequence_relation.oid
           OR inhparent = sequence_relation.oid
      );
  IF serial_dependency_count <> 1 OR serial_shape_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0037 found non-canonical outbox serial sequence shape/ownership';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid IN (
      'public.account_blob_assets'::regclass,
      'public.account_blob_asset_claims'::regclass,
      'public.account_asset_erasure_outbox'::regclass
    ) AND contype IN ('p', 'f', 'u', 'c') AND (
      NOT convalidated OR condeferrable OR condeferred OR NOT conislocal
      OR coninhcount <> 0 OR conparentid <> 0
      OR (contype = 'c' AND connoinherit)
      OR (contype IN ('p', 'f', 'u') AND NOT connoinherit)
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0037 requires validated local non-deferrable asset constraints';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'account_blob_assets_owner_user_fk'
      AND conrelid = 'public.account_blob_assets'::regclass
      AND contype = 'f'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.account_blob_assets'::regclass
          AND attname = 'owner_user_id' AND NOT attisdropped)]::smallint[]
      AND confrelid = 'public.users'::regclass
      AND confkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.users'::regclass
          AND attname = 'id' AND NOT attisdropped)]::smallint[]
      AND confdeltype = 'n' AND confupdtype = 'a' AND confmatchtype = 's'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'account_blob_asset_claims_asset_fk'
      AND conrelid = 'public.account_blob_asset_claims'::regclass
      AND contype = 'f'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.account_blob_asset_claims'::regclass
          AND attname = 'asset_key' AND NOT attisdropped)]::smallint[]
      AND confrelid = 'public.account_blob_assets'::regclass
      AND confkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.account_blob_assets'::regclass
          AND attname = 'asset_key' AND NOT attisdropped)]::smallint[]
      AND confdeltype = 'c' AND confupdtype = 'a' AND confmatchtype = 's'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'account_blob_asset_claims_erasure_user_fk'
      AND conrelid = 'public.account_blob_asset_claims'::regclass
      AND contype = 'f'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.account_blob_asset_claims'::regclass
          AND attname = 'erasure_user_id' AND NOT attisdropped)]::smallint[]
      AND confrelid = 'public.users'::regclass
      AND confkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.users'::regclass
          AND attname = 'id' AND NOT attisdropped)]::smallint[]
      AND confdeltype = 'c' AND confupdtype = 'a' AND confmatchtype = 's'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'account_asset_erasure_outbox_registry_fk'
      AND conrelid = 'public.account_asset_erasure_outbox'::regclass
      AND contype = 'f'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.account_asset_erasure_outbox'::regclass
          AND attname = 'asset_key' AND NOT attisdropped)]::smallint[]
      AND confrelid = 'public.account_blob_assets'::regclass
      AND confkey = ARRAY[(SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.account_blob_assets'::regclass
          AND attname = 'asset_key' AND NOT attisdropped)]::smallint[]
      AND confdeltype = 'r' AND confupdtype = 'a' AND confmatchtype = 's'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '0037 foreign-key action drift';
  END IF;
END $$;

-- Named indexes are repairable only when they already belong to the expected
-- table. A same-name object elsewhere is ambiguous and must never be dropped.
DO $$
DECLARE
  expected record;
  existing_kind "char";
  indexed_table oid;
BEGIN
  FOR expected IN
    SELECT * FROM (VALUES
      ('account_blob_assets_live_url_uidx','account_blob_assets'),
      ('account_blob_assets_owner_idx','account_blob_assets'),
      ('account_blob_assets_owner_active_idx','account_blob_assets'),
      ('account_blob_assets_pending_unclaimed_idx','account_blob_assets'),
      ('account_blob_asset_claims_asset_idx','account_blob_asset_claims'),
      ('account_blob_asset_claims_erasure_user_idx','account_blob_asset_claims'),
      ('account_asset_erasure_outbox_due_idx','account_asset_erasure_outbox'),
      ('account_asset_erasure_outbox_expired_lease_idx','account_asset_erasure_outbox')
    ) AS expected_index(index_name, table_name)
  LOOP
    SELECT relation.relkind, index_catalog.indrelid
    INTO existing_kind, indexed_table
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    LEFT JOIN pg_index AS index_catalog ON index_catalog.indexrelid = relation.oid
    WHERE namespace.nspname = 'public'
      AND relation.relname = expected.index_name;
    IF existing_kind IS NOT NULL AND (
      existing_kind NOT IN ('i'::"char", 'I'::"char")
      OR indexed_table IS DISTINCT FROM
        format('public.%I', expected.table_name)::regclass
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = format(
          '0037 refuses named index object public.%I outside public.%I',
          expected.index_name,
          expected.table_name
        );
    END IF;
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.account_blob_assets_live_url_uidx;
CREATE UNIQUE INDEX account_blob_assets_live_url_uidx
  ON public.account_blob_assets (asset_url) WHERE asset_url IS NOT NULL;
DROP INDEX IF EXISTS public.account_blob_assets_owner_idx;
CREATE INDEX account_blob_assets_owner_idx
  ON public.account_blob_assets (owner_user_id);
DROP INDEX IF EXISTS public.account_blob_assets_owner_active_idx;
CREATE INDEX account_blob_assets_owner_active_idx
  ON public.account_blob_assets (owner_user_id, asset_key)
  WHERE state = 'active' AND erasure_policy = 'account_erasure';
DROP INDEX IF EXISTS public.account_blob_assets_pending_unclaimed_idx;
CREATE INDEX account_blob_assets_pending_unclaimed_idx
  ON public.account_blob_assets (created_at, asset_key)
  WHERE state = 'active' AND erasure_policy = 'account_erasure'
    AND provenance = 'legal_contract_pending';
DROP INDEX IF EXISTS public.account_blob_asset_claims_asset_idx;
CREATE INDEX account_blob_asset_claims_asset_idx
  ON public.account_blob_asset_claims (asset_key);
DROP INDEX IF EXISTS public.account_blob_asset_claims_erasure_user_idx;
CREATE INDEX account_blob_asset_claims_erasure_user_idx
  ON public.account_blob_asset_claims (erasure_user_id, asset_key)
  WHERE erasure_user_id IS NOT NULL;
DROP INDEX IF EXISTS public.account_asset_erasure_outbox_due_idx;
CREATE INDEX account_asset_erasure_outbox_due_idx
  ON public.account_asset_erasure_outbox (next_attempt_at, id)
  WHERE status IN ('pending', 'failed');
DROP INDEX IF EXISTS public.account_asset_erasure_outbox_expired_lease_idx;
CREATE INDEX account_asset_erasure_outbox_expired_lease_idx
  ON public.account_asset_erasure_outbox (lease_until, id)
  WHERE status = 'processing';

DO $$
DECLARE
  relation_name text;
  actual_indexes text[];
  expected_indexes text[];
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'account_blob_assets','account_blob_asset_claims','account_asset_erasure_outbox'
  ] LOOP
    SELECT array_agg(index_class.relname ORDER BY index_class.relname)
    INTO actual_indexes
    FROM pg_index index_row
    JOIN pg_class index_class ON index_class.oid = index_row.indexrelid
    WHERE index_row.indrelid = format('public.%I', relation_name)::regclass;
    expected_indexes := CASE relation_name
      WHEN 'account_blob_assets' THEN ARRAY[
        'account_blob_assets_live_url_uidx','account_blob_assets_owner_active_idx',
        'account_blob_assets_owner_idx','account_blob_assets_pending_unclaimed_idx',
        'account_blob_assets_pkey'
      ]
      WHEN 'account_blob_asset_claims' THEN ARRAY[
        'account_blob_asset_claims_asset_idx','account_blob_asset_claims_erasure_user_idx',
        'account_blob_asset_claims_pkey'
      ]
      ELSE ARRAY[
        'account_asset_erasure_outbox_asset_key_unique',
        'account_asset_erasure_outbox_due_idx',
        'account_asset_erasure_outbox_expired_lease_idx',
        'account_asset_erasure_outbox_pkey'
      ]
    END;
    SELECT array_agg(value ORDER BY value) INTO expected_indexes
    FROM unnest(expected_indexes) AS expected(value);
    IF actual_indexes IS DISTINCT FROM expected_indexes THEN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = format('0037 unexpected index drift on public.%s', relation_name);
    END IF;
  END LOOP;

  IF (SELECT array_agg(attribute.attname::text ORDER BY key_position.ordinality)
      FROM pg_constraint constraint_row
      CROSS JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY key_position(attnum, ordinality)
      JOIN pg_attribute attribute ON attribute.attrelid = constraint_row.conrelid
        AND attribute.attnum = key_position.attnum
      WHERE constraint_row.conrelid = 'public.account_blob_assets'::regclass
        AND constraint_row.conname = 'account_blob_assets_pkey' AND constraint_row.contype = 'p')
      IS DISTINCT FROM ARRAY['asset_key']::text[]
    OR (SELECT array_agg(attribute.attname::text ORDER BY key_position.ordinality)
      FROM pg_constraint constraint_row
      CROSS JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY key_position(attnum, ordinality)
      JOIN pg_attribute attribute ON attribute.attrelid = constraint_row.conrelid
        AND attribute.attnum = key_position.attnum
      WHERE constraint_row.conrelid = 'public.account_blob_asset_claims'::regclass
        AND constraint_row.conname = 'account_blob_asset_claims_pkey' AND constraint_row.contype = 'p')
      IS DISTINCT FROM ARRAY['claim_key']::text[]
    OR (SELECT array_agg(attribute.attname::text ORDER BY key_position.ordinality)
      FROM pg_constraint constraint_row
      CROSS JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY key_position(attnum, ordinality)
      JOIN pg_attribute attribute ON attribute.attrelid = constraint_row.conrelid
        AND attribute.attnum = key_position.attnum
      WHERE constraint_row.conrelid = 'public.account_asset_erasure_outbox'::regclass
        AND constraint_row.conname = 'account_asset_erasure_outbox_pkey' AND constraint_row.contype = 'p')
      IS DISTINCT FROM ARRAY['id']::text[]
    OR (SELECT array_agg(attribute.attname::text ORDER BY key_position.ordinality)
      FROM pg_constraint constraint_row
      CROSS JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY key_position(attnum, ordinality)
      JOIN pg_attribute attribute ON attribute.attrelid = constraint_row.conrelid
        AND attribute.attnum = key_position.attnum
      WHERE constraint_row.conrelid = 'public.account_asset_erasure_outbox'::regclass
        AND constraint_row.conname = 'account_asset_erasure_outbox_asset_key_unique'
        AND constraint_row.contype = 'u')
      IS DISTINCT FROM ARRAY['asset_key']::text[]
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '0037 primary/unique key shape drift';
  END IF;
END $$;

-- Verify every physical index property used by locking and worker scans.
DO $$
DECLARE
  expected record;
  canonical_count integer;
BEGIN
  FOR expected IN
    SELECT * FROM (VALUES
      ('account_blob_assets_pkey','account_blob_assets',ARRAY['asset_key']::text[],true,true,false,1),
      ('account_blob_assets_live_url_uidx','account_blob_assets',ARRAY['asset_url']::text[],true,false,true,0),
      ('account_blob_assets_owner_idx','account_blob_assets',ARRAY['owner_user_id']::text[],false,false,false,0),
      ('account_blob_assets_owner_active_idx','account_blob_assets',ARRAY['owner_user_id','asset_key']::text[],false,false,true,0),
      ('account_blob_assets_pending_unclaimed_idx','account_blob_assets',ARRAY['created_at','asset_key']::text[],false,false,true,0),
      ('account_blob_asset_claims_pkey','account_blob_asset_claims',ARRAY['claim_key']::text[],true,true,false,1),
      ('account_blob_asset_claims_asset_idx','account_blob_asset_claims',ARRAY['asset_key']::text[],false,false,false,0),
      ('account_blob_asset_claims_erasure_user_idx','account_blob_asset_claims',ARRAY['erasure_user_id','asset_key']::text[],false,false,true,0),
      ('account_asset_erasure_outbox_pkey','account_asset_erasure_outbox',ARRAY['id']::text[],true,true,false,1),
      ('account_asset_erasure_outbox_asset_key_unique','account_asset_erasure_outbox',ARRAY['asset_key']::text[],true,false,false,1),
      ('account_asset_erasure_outbox_due_idx','account_asset_erasure_outbox',ARRAY['next_attempt_at','id']::text[],false,false,true,0),
      ('account_asset_erasure_outbox_expired_lease_idx','account_asset_erasure_outbox',ARRAY['lease_until','id']::text[],false,false,true,0)
    ) AS expected_index(
      index_name, table_name, key_columns, is_unique, is_primary,
      has_predicate, constraint_count
    )
  LOOP
    SELECT count(*)::integer INTO canonical_count
    FROM pg_index AS index_catalog
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_catalog.indexrelid
    JOIN pg_namespace AS index_namespace
      ON index_namespace.oid = index_relation.relnamespace
    JOIN pg_class AS table_relation
      ON table_relation.oid = index_catalog.indrelid
    JOIN pg_am AS access_method ON access_method.oid = index_relation.relam
    WHERE index_namespace.nspname = 'public'
      AND index_relation.relname = expected.index_name
      AND index_catalog.indrelid = format('public.%I', expected.table_name)::regclass
      AND index_relation.relkind = 'i'
      AND index_relation.relowner = table_relation.relowner
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
      AND (index_catalog.indpred IS NOT NULL) = expected.has_predicate
      AND index_catalog.indnkeyatts = cardinality(expected.key_columns)
      AND index_catalog.indnatts = cardinality(expected.key_columns)
      AND (
        SELECT array_agg(attribute.attname::text ORDER BY key_position.ordinality)
        FROM unnest(index_catalog.indkey::smallint[]) WITH ORDINALITY
          AS key_position(attnum, ordinality)
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = index_catalog.indrelid
         AND attribute.attnum = key_position.attnum
      ) = expected.key_columns
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(index_catalog.indclass::oid[]) WITH ORDINALITY
          AS class_position(opclass_oid, ordinality)
        JOIN unnest(index_catalog.indkey::smallint[]) WITH ORDINALITY
          AS key_position(attnum, ordinality)
          USING (ordinality)
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = index_catalog.indrelid
         AND attribute.attnum = key_position.attnum
        JOIN pg_opclass AS operator_class
          ON operator_class.oid = class_position.opclass_oid
        WHERE NOT operator_class.opcdefault
          OR operator_class.opcmethod <> access_method.oid
          OR operator_class.opcintype <> attribute.atttypid
          OR index_catalog.indcollation[class_position.ordinality - 1]
            <> attribute.attcollation
          OR index_catalog.indoption[class_position.ordinality - 1] <> 0
      )
      AND index_relation.reltablespace = 0
      AND index_relation.reloptions IS NULL
      AND (
        SELECT count(*)::integer FROM pg_constraint AS constraint_row
        WHERE constraint_row.conindid = index_catalog.indexrelid
          AND constraint_row.conrelid = index_catalog.indrelid
      ) = expected.constraint_count;
    IF canonical_count <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = format('0037 failed exact index shape for %I', expected.index_name);
    END IF;
  END LOOP;
END $$;

-- Claim creation follows the same user -> global advisory -> asset order as
-- account erasure. The final KEY SHARE registry lock means a concurrent new
-- reference either commits before the claims check or is rejected after the
-- asset is queued.
CREATE OR REPLACE FUNCTION public.account_blob_record_claim(
  p_url text,
  p_source_table text,
  p_source_id text,
  p_source_field text,
  p_erasure_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  registered_key text;
  registered_state text;
BEGIN
  IF p_url IS NULL OR p_url = '' THEN RETURN; END IF;

  -- `account erasure` takes the user row before the global Blob fence.  Claim
  -- creation must use the same order; otherwise the claim FK can wait on the
  -- user while an erasure waits on this function's advisory/asset locks.
  IF p_erasure_user_id IS NOT NULL THEN
    PERFORM 1
    FROM public.users
    WHERE id = p_erasure_user_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '23503',
        MESSAGE = 'Blob claim erasure owner no longer exists';
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(1163022925, 37);

  SELECT asset_key, state INTO registered_key, registered_state
  FROM public.account_blob_assets
  WHERE asset_url = p_url
  FOR KEY SHARE;
  IF registered_key IS NULL THEN RETURN; END IF;
  IF registered_state <> 'active' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'registered Blob is pending erasure';
  END IF;
  INSERT INTO public.account_blob_asset_claims
    (claim_key, asset_key, erasure_user_id, source_table, source_id, source_field)
  VALUES (
    p_source_table || ':' || p_source_id || ':' || p_source_field || ':' || registered_key,
    registered_key, p_erasure_user_id, p_source_table, p_source_id, p_source_field
  )
  ON CONFLICT (claim_key) DO UPDATE SET
    asset_key = EXCLUDED.asset_key,
    erasure_user_id = EXCLUDED.erasure_user_id,
    source_table = EXCLUDED.source_table,
    source_id = EXCLUDED.source_id,
    source_field = EXCLUDED.source_field;
END $$;

-- Every claim removal/reclassification must serialize with account capture.
-- A row can reference at most two registry keys during an UPDATE; sorting
-- them makes the lock order deterministic across concurrent transactions.
CREATE OR REPLACE FUNCTION public.account_blob_fence_claim_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  affected_keys text[];
  locked_count integer;
BEGIN
  -- FK validation for INSERT/UPDATE also needs a user-row lock.  Acquire it
  -- before the global fence so direct service writes cannot invert the
  -- canonical user -> global advisory -> asset order.
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.erasure_user_id IS NOT NULL THEN
    PERFORM 1
    FROM public.users
    WHERE id = NEW.erasure_user_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '23503',
        MESSAGE = 'Blob claim erasure owner no longer exists';
    END IF;
  END IF;

  -- FK cascades can fire row triggers in storage order. Serialize claim
  -- mutations first, then take the small affected key set in sorted order.
  PERFORM pg_advisory_xact_lock(1163022925, 37);
  SELECT array_agg(candidate.asset_key ORDER BY candidate.asset_key)
  INTO affected_keys
  FROM (
    SELECT DISTINCT key_value AS asset_key
    FROM unnest(ARRAY[
      CASE WHEN TG_OP IN ('DELETE', 'UPDATE') THEN OLD.asset_key ELSE NULL END,
      CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.asset_key ELSE NULL END
    ]::text[]) AS supplied(key_value)
    WHERE key_value IS NOT NULL
  ) candidate;

  PERFORM 1
  FROM public.account_blob_assets asset
  WHERE asset.asset_key = ANY (affected_keys)
  ORDER BY asset.asset_key
  FOR KEY SHARE;
  GET DIAGNOSTICS locked_count = ROW_COUNT;
  IF locked_count <> cardinality(affected_keys) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Blob claim mutation lost its registry fence';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

-- Finalize only true orphans. This helper deliberately scans the complete
-- candidate set and locks it in asset-key order: deferred row triggers may be
-- delivered in any order, while concurrent claim creation/removal must not be.
CREATE OR REPLACE FUNCTION public.account_blob_enqueue_unclaimed_orphans()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  orphan record;
  changed_count integer;
BEGIN
  FOR orphan IN
    SELECT asset.asset_key, asset.asset_url
    FROM public.account_blob_assets asset
    WHERE asset.owner_user_id IS NULL
      AND asset.erasure_policy = 'account_erasure'
      AND asset.state = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.account_blob_asset_claims claim
        WHERE claim.asset_key = asset.asset_key
      )
    ORDER BY asset.asset_key
    FOR UPDATE OF asset
  LOOP
    -- The SELECT may have waited behind a claim's KEY SHARE lock. Recheck in
    -- a fresh statement snapshot before turning the durable registry state.
    PERFORM 1 FROM public.account_blob_asset_claims claim
    WHERE claim.asset_key = orphan.asset_key
    LIMIT 1;
    IF FOUND THEN CONTINUE; END IF;

    INSERT INTO public.account_asset_erasure_outbox (asset_key, asset_url)
    VALUES (orphan.asset_key, orphan.asset_url)
    ON CONFLICT (asset_key) DO NOTHING;
    GET DIAGNOSTICS changed_count = ROW_COUNT;
    IF changed_count <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'orphan Blob has conflicting erasure state';
    END IF;

    UPDATE public.account_blob_assets asset
    SET state = 'queued', updated_at = now()
    WHERE asset.asset_key = orphan.asset_key
      AND asset.owner_user_id IS NULL
      AND asset.erasure_policy = 'account_erasure'
      AND asset.state = 'active'
      AND asset.asset_url = orphan.asset_url
      AND NOT EXISTS (
        SELECT 1 FROM public.account_blob_asset_claims claim
        WHERE claim.asset_key = orphan.asset_key
      );
    GET DIAGNOSTICS changed_count = ROW_COUNT;
    IF changed_count <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'orphan Blob registry transition was not fenced';
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.account_blob_deferred_orphan_check()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  affected_keys text[];
  orphan record;
  changed_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(1163022925, 37);

  IF TG_TABLE_NAME = 'account_blob_asset_claims' THEN
    -- A claim row proves that the object was attached at least once.  When its
    -- last live source disappears, delete that exact registered object even if
    -- the uploader account still exists.  Unattached generic drafts are never
    -- swept because their keys cannot appear in OLD/NEW claim rows.
    SELECT array_agg(candidate.asset_key ORDER BY candidate.asset_key)
    INTO affected_keys
    FROM (
      SELECT DISTINCT key_value AS asset_key
      FROM unnest(ARRAY[
        OLD.asset_key,
        CASE WHEN TG_OP = 'UPDATE' THEN NEW.asset_key ELSE NULL END
      ]::text[]) AS supplied(key_value)
      WHERE key_value IS NOT NULL
    ) candidate;

    FOR orphan IN
      SELECT asset.asset_key, asset.asset_url
      FROM public.account_blob_assets asset
      WHERE asset.asset_key = ANY (affected_keys)
        AND asset.erasure_policy = 'account_erasure'
        AND asset.state = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM public.account_blob_asset_claims claim
          WHERE claim.asset_key = asset.asset_key
        )
      ORDER BY asset.asset_key
      FOR UPDATE OF asset
    LOOP
      -- A concurrent creator may have waited on the registry row.  Recheck in
      -- a fresh statement snapshot immediately before the state transition.
      PERFORM 1 FROM public.account_blob_asset_claims claim
      WHERE claim.asset_key = orphan.asset_key
      LIMIT 1;
      IF FOUND THEN CONTINUE; END IF;

      INSERT INTO public.account_asset_erasure_outbox (asset_key, asset_url)
      VALUES (orphan.asset_key, orphan.asset_url)
      ON CONFLICT (asset_key) DO NOTHING;
      GET DIAGNOSTICS changed_count = ROW_COUNT;
      IF changed_count <> 1 THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = 'detached Blob has conflicting erasure state';
      END IF;

      UPDATE public.account_blob_assets asset
      SET state = 'queued', owner_user_id = NULL, updated_at = now()
      WHERE asset.asset_key = orphan.asset_key
        AND asset.asset_url = orphan.asset_url
        AND asset.erasure_policy = 'account_erasure'
        AND asset.state = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM public.account_blob_asset_claims claim
          WHERE claim.asset_key = orphan.asset_key
        );
      GET DIAGNOSTICS changed_count = ROW_COUNT;
      IF changed_count <> 1 THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = 'detached Blob registry transition was not fenced';
      END IF;
    END LOOP;
  ELSIF TG_TABLE_NAME = 'account_blob_assets' THEN
    PERFORM public.account_blob_enqueue_unclaimed_orphans();
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'unsupported Blob orphan trigger table';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.account_blob_sync_row_claims()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  row_data jsonb;
  row_id text;
  erasure_owner uuid;
  field_name text;
  field_names text[];
  field_urls text[];
  candidate_urls text[] := ARRAY[]::text[];
  candidate_url text;
  has_current_claim boolean;
  has_registered_candidate boolean;
  has_dependent_claim boolean := false;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  row_id := row_data ->> 'id';
  CASE TG_TABLE_NAME
    WHEN 'users' THEN
      erasure_owner := (row_data ->> 'id')::uuid;
      field_names := ARRAY['avatar_url'];
    WHEN 'categories' THEN
      erasure_owner := NULL;
      field_names := ARRAY['image_url'];
    WHEN 'artists' THEN
      erasure_owner := nullif(row_data ->> 'user_id','')::uuid;
      field_names := ARRAY['photo_url','video_testimonials'];
    WHEN 'artist_images' THEN
      SELECT user_id INTO erasure_owner FROM public.artists
      WHERE id = (row_data ->> 'artist_id')::integer;
      field_names := ARRAY['url'];
    WHEN 'venues' THEN
      erasure_owner := CASE WHEN row_data ->> 'organization_id' IS NULL
        THEN nullif(row_data ->> 'user_id','')::uuid ELSE NULL END;
      field_names := ARRAY['menu_url','menu_pdf_url','virtual_tour_url','og_image_url','video_testimonials'];
    WHEN 'venue_images' THEN
      SELECT CASE WHEN organization_id IS NULL THEN user_id ELSE NULL END
      INTO erasure_owner FROM public.venues
      WHERE id = (row_data ->> 'venue_id')::integer;
      field_names := ARRAY['url'];
    WHEN 'reviews' THEN
      erasure_owner := NULL;
      field_names := ARRAY['photos'];
    WHEN 'blog_posts' THEN
      erasure_owner := NULL;
      field_names := ARRAY['cover_image_url'];
    WHEN 'booking_requests' THEN
      erasure_owner := NULL;
      field_names := ARRAY['contract_pdf_url'];
    WHEN 'chat_messages' THEN
      erasure_owner := NULL;
      IF row_data ->> 'conversation_id' IS NOT NULL THEN
        SELECT client_user_id INTO erasure_owner FROM public.conversations
        WHERE id = (row_data ->> 'conversation_id')::integer;
      END IF;
      field_names := ARRAY['attachment_url'];
    WHEN 'event_plans' THEN
      erasure_owner := nullif(row_data ->> 'user_id','')::uuid;
      field_names := ARRAY['moments_music_url'];
    WHEN 'event_photos' THEN
      SELECT user_id INTO erasure_owner FROM public.event_plans
      WHERE id = (row_data ->> 'plan_id')::integer;
      field_names := ARRAY['url'];
    WHEN 'invitation_templates' THEN
      erasure_owner := NULL;
      field_names := ARRAY['thumbnail_url'];
    WHEN 'invitations' THEN
      erasure_owner := nullif(row_data ->> 'user_id','')::uuid;
      field_names := ARRAY['cover_image_url'];
    WHEN 'conversations' THEN
      erasure_owner := nullif(row_data ->> 'client_user_id','')::uuid;
      field_names := ARRAY[]::text[];
    ELSE
      RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'unsupported Blob claim trigger table';
  END CASE;

  -- Cheap fast path: ordinary application rows must not contend on the
  -- global asset lock. Only current claims, registered candidate URLs, or a
  -- parent ownership change affecting child claims enter the fenced path.
  IF TG_OP <> 'DELETE' THEN
    FOREACH field_name IN ARRAY field_names LOOP
      field_urls := ARRAY[]::text[];
      IF field_name = 'video_testimonials' THEN
        IF jsonb_typeof(row_data -> field_name) = 'array' THEN
          SELECT coalesce(array_agg(candidate.value ORDER BY candidate.value), ARRAY[]::text[])
          INTO field_urls
          FROM (
            SELECT DISTINCT item ->> 'url' AS value
            FROM jsonb_array_elements(row_data -> field_name) item
            WHERE jsonb_typeof(item) = 'object' AND item ->> 'url' IS NOT NULL
          ) candidate;
        END IF;
      ELSIF field_name = 'photos' THEN
        IF jsonb_typeof(row_data -> field_name) = 'array' THEN
          SELECT coalesce(array_agg(candidate.value ORDER BY candidate.value), ARRAY[]::text[])
          INTO field_urls
          FROM (
            SELECT DISTINCT value
            FROM jsonb_array_elements_text(row_data -> field_name) value
          ) candidate;
        END IF;
      ELSE
        candidate_url := nullif(row_data ->> field_name, '');
        IF candidate_url IS NOT NULL THEN
          field_urls := ARRAY[candidate_url];
        END IF;
      END IF;
      candidate_urls := candidate_urls || field_urls;
    END LOOP;
    SELECT coalesce(array_agg(DISTINCT value ORDER BY value), ARRAY[]::text[])
    INTO candidate_urls FROM unnest(candidate_urls) supplied(value);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.account_blob_asset_claims claim
    WHERE claim.source_table = TG_TABLE_NAME AND claim.source_id = row_id
  ) INTO has_current_claim;
  SELECT EXISTS (
    SELECT 1 FROM public.account_blob_assets asset
    WHERE asset.asset_url = ANY (candidate_urls)
  ) INTO has_registered_candidate;

  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'artists'
    AND (to_jsonb(OLD) ->> 'user_id') IS DISTINCT FROM (row_data ->> 'user_id') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.account_blob_asset_claims claim
      JOIN public.artist_images image ON image.id::text = claim.source_id
      WHERE claim.source_table = 'artist_images'
        AND image.artist_id = (row_data ->> 'id')::integer
    ) INTO has_dependent_claim;
  ELSIF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'venues'
    AND (
      (to_jsonb(OLD) ->> 'user_id') IS DISTINCT FROM (row_data ->> 'user_id')
      OR (to_jsonb(OLD) ->> 'organization_id') IS DISTINCT FROM (row_data ->> 'organization_id')
    ) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.account_blob_asset_claims claim
      JOIN public.venue_images image ON image.id::text = claim.source_id
      WHERE claim.source_table = 'venue_images'
        AND image.venue_id = (row_data ->> 'id')::integer
    ) INTO has_dependent_claim;
  ELSIF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'event_plans'
    AND (to_jsonb(OLD) ->> 'user_id') IS DISTINCT FROM (row_data ->> 'user_id') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.account_blob_asset_claims claim
      JOIN public.event_photos photo ON photo.id::text = claim.source_id
      WHERE claim.source_table = 'event_photos'
        AND photo.plan_id = (row_data ->> 'id')::integer
    ) INTO has_dependent_claim;
  ELSIF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'conversations'
    AND (to_jsonb(OLD) ->> 'client_user_id') IS DISTINCT FROM (row_data ->> 'client_user_id') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.account_blob_asset_claims claim
      JOIN public.chat_messages message ON message.id::text = claim.source_id
      WHERE claim.source_table = 'chat_messages'
        AND message.conversation_id = (row_data ->> 'id')::integer
    ) INTO has_dependent_claim;
  END IF;

  IF NOT has_current_claim
    AND NOT has_registered_candidate
    AND NOT has_dependent_claim THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- Claim insertion/update performs an FK check on this user.  Take that row
  -- before the global fence, matching account erasure and the helper trigger.
  IF erasure_owner IS NOT NULL THEN
    PERFORM 1
    FROM public.users
    WHERE id = erasure_owner
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '23503',
        MESSAGE = 'Blob claim erasure owner no longer exists';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(1163022925, 37);
  PERFORM 1 FROM public.account_blob_assets asset
  WHERE asset.asset_url = ANY (candidate_urls)
    OR EXISTS (
      SELECT 1 FROM public.account_blob_asset_claims claim
      WHERE claim.asset_key = asset.asset_key
        AND claim.source_table = TG_TABLE_NAME
        AND claim.source_id = row_id
    )
  ORDER BY asset.asset_key
  FOR KEY SHARE OF asset;
  DELETE FROM public.account_blob_asset_claims
  WHERE source_table = TG_TABLE_NAME AND source_id = row_id;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  FOREACH field_name IN ARRAY field_names LOOP
    IF field_name = 'video_testimonials' THEN
      FOR candidate_url IN
        SELECT DISTINCT item ->> 'url'
        FROM jsonb_array_elements(coalesce(row_data -> field_name, '[]'::jsonb)) item
        WHERE jsonb_typeof(item) = 'object' AND item ->> 'url' IS NOT NULL
        ORDER BY item ->> 'url'
      LOOP
        PERFORM public.account_blob_record_claim(candidate_url, TG_TABLE_NAME, row_id, field_name, erasure_owner);
      END LOOP;
    ELSIF field_name = 'photos' THEN
      FOR candidate_url IN
        SELECT DISTINCT value
        FROM jsonb_array_elements_text(coalesce(row_data -> field_name, '[]'::jsonb)) value
        ORDER BY value
      LOOP
        PERFORM public.account_blob_record_claim(candidate_url, TG_TABLE_NAME, row_id, field_name, erasure_owner);
      END LOOP;
    ELSE
      PERFORM public.account_blob_record_claim(row_data ->> field_name, TG_TABLE_NAME, row_id, field_name, erasure_owner);
    END IF;
  END LOOP;

  -- Parent ownership can change without updating its child rows. Lock every
  -- involved registry object before reclassifying those dependent claims.
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'artists'
    AND (to_jsonb(OLD) ->> 'user_id') IS DISTINCT FROM (row_data ->> 'user_id') THEN
    PERFORM 1 FROM public.account_blob_assets asset
    JOIN public.account_blob_asset_claims claim ON claim.asset_key = asset.asset_key
    JOIN public.artist_images image ON image.id::text = claim.source_id
    WHERE claim.source_table = 'artist_images'
      AND image.artist_id = (row_data ->> 'id')::integer
    ORDER BY asset.asset_key FOR KEY SHARE OF asset;
    UPDATE public.account_blob_asset_claims claim SET erasure_user_id = erasure_owner
    FROM public.artist_images image
    WHERE claim.source_table = 'artist_images' AND image.id::text = claim.source_id
      AND image.artist_id = (row_data ->> 'id')::integer;
  ELSIF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'venues'
    AND (
      (to_jsonb(OLD) ->> 'user_id') IS DISTINCT FROM (row_data ->> 'user_id')
      OR (to_jsonb(OLD) ->> 'organization_id') IS DISTINCT FROM (row_data ->> 'organization_id')
    ) THEN
    PERFORM 1 FROM public.account_blob_assets asset
    JOIN public.account_blob_asset_claims claim ON claim.asset_key = asset.asset_key
    JOIN public.venue_images image ON image.id::text = claim.source_id
    WHERE claim.source_table = 'venue_images'
      AND image.venue_id = (row_data ->> 'id')::integer
    ORDER BY asset.asset_key FOR KEY SHARE OF asset;
    UPDATE public.account_blob_asset_claims claim SET erasure_user_id = erasure_owner
    FROM public.venue_images image
    WHERE claim.source_table = 'venue_images' AND image.id::text = claim.source_id
      AND image.venue_id = (row_data ->> 'id')::integer;
  ELSIF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'event_plans'
    AND (to_jsonb(OLD) ->> 'user_id') IS DISTINCT FROM (row_data ->> 'user_id') THEN
    PERFORM 1 FROM public.account_blob_assets asset
    JOIN public.account_blob_asset_claims claim ON claim.asset_key = asset.asset_key
    JOIN public.event_photos photo ON photo.id::text = claim.source_id
    WHERE claim.source_table = 'event_photos'
      AND photo.plan_id = (row_data ->> 'id')::integer
    ORDER BY asset.asset_key FOR KEY SHARE OF asset;
    UPDATE public.account_blob_asset_claims claim SET erasure_user_id = erasure_owner
    FROM public.event_photos photo
    WHERE claim.source_table = 'event_photos' AND photo.id::text = claim.source_id
      AND photo.plan_id = (row_data ->> 'id')::integer;
  ELSIF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'conversations'
    AND (to_jsonb(OLD) ->> 'client_user_id') IS DISTINCT FROM (row_data ->> 'client_user_id') THEN
    PERFORM 1 FROM public.account_blob_assets asset
    JOIN public.account_blob_asset_claims claim ON claim.asset_key = asset.asset_key
    JOIN public.chat_messages message ON message.id::text = claim.source_id
    WHERE claim.source_table = 'chat_messages'
      AND message.conversation_id = (row_data ->> 'id')::integer
    ORDER BY asset.asset_key FOR KEY SHARE OF asset;
    UPDATE public.account_blob_asset_claims claim SET erasure_user_id =
      nullif(row_data ->> 'client_user_id','')::uuid
    FROM public.chat_messages message
    WHERE claim.source_table = 'chat_messages' AND message.id::text = claim.source_id
      AND message.conversation_id = (row_data ->> 'id')::integer;
  END IF;
  RETURN NEW;
END $$;

-- These SECURITY DEFINER helpers are callable only as trigger internals or by
-- the trusted owner. Reject overloads and catalog drift that could broaden
-- their authority or change their fixed search path.
DO $$
DECLARE
  expected record;
  canonical_count integer;
  helper_count integer;
BEGIN
  SELECT count(*)::integer INTO helper_count
  FROM pg_proc AS function_row
  JOIN pg_namespace AS namespace ON namespace.oid = function_row.pronamespace
  WHERE namespace.nspname = 'public'
    AND function_row.proname IN (
      'account_blob_record_claim',
      'account_blob_fence_claim_mutation',
      'account_blob_enqueue_unclaimed_orphans',
      'account_blob_deferred_orphan_check',
      'account_blob_sync_row_claims'
    );
  IF helper_count <> 5 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0037 refuses missing or overloaded Blob helper functions';
  END IF;

  FOR expected IN
    SELECT * FROM (VALUES
      ('account_blob_record_claim','text, text, text, text, uuid','void'),
      ('account_blob_fence_claim_mutation','','trigger'),
      ('account_blob_enqueue_unclaimed_orphans','','void'),
      ('account_blob_deferred_orphan_check','','trigger'),
      ('account_blob_sync_row_claims','','trigger')
    ) AS expected_function(function_name, argument_types, result_type)
  LOOP
    SELECT count(*)::integer INTO canonical_count
    FROM pg_proc AS function_row
    JOIN pg_namespace AS namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_language AS language_row ON language_row.oid = function_row.prolang
    JOIN pg_class AS registry_table
      ON registry_table.oid = 'public.account_blob_assets'::regclass
    WHERE namespace.nspname = 'public'
      AND function_row.proname = expected.function_name
      AND oidvectortypes(function_row.proargtypes) = expected.argument_types
      AND pg_get_function_result(function_row.oid) = expected.result_type
      AND function_row.prokind = 'f'
      AND language_row.lanname = 'plpgsql'
      AND function_row.prosecdef
      AND NOT function_row.proleakproof
      AND NOT function_row.proisstrict
      AND function_row.provolatile = 'v'
      AND function_row.proparallel = 'u'
      AND function_row.proowner = registry_table.relowner
      AND function_row.proconfig = ARRAY['search_path=pg_catalog, public']::text[];
    IF canonical_count <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = format(
          '0037 failed exact helper function shape for %I',
          expected.function_name
        );
    END IF;
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS account_blob_claim_mutation_fence_trg
  ON public.account_blob_asset_claims;
CREATE TRIGGER account_blob_claim_mutation_fence_trg
BEFORE INSERT OR DELETE OR UPDATE ON public.account_blob_asset_claims
FOR EACH ROW EXECUTE FUNCTION public.account_blob_fence_claim_mutation();

DROP TRIGGER IF EXISTS account_blob_claim_orphan_check_trg
  ON public.account_blob_asset_claims;
CREATE CONSTRAINT TRIGGER account_blob_claim_orphan_check_trg
AFTER DELETE OR UPDATE ON public.account_blob_asset_claims
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.account_blob_deferred_orphan_check();

DROP TRIGGER IF EXISTS account_blob_owner_orphan_check_trg
  ON public.account_blob_assets;
CREATE CONSTRAINT TRIGGER account_blob_owner_orphan_check_trg
AFTER UPDATE ON public.account_blob_assets
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (
  OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id
  AND NEW.owner_user_id IS NULL
  AND NEW.state = 'active'
  AND NEW.erasure_policy = 'account_erasure'
)
EXECUTE FUNCTION public.account_blob_deferred_orphan_check();

DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN SELECT unnest(ARRAY[
    'users','categories','artists','artist_images','venues','venue_images',
    'reviews','blog_posts','booking_requests','chat_messages','event_plans',
    'event_photos','invitation_templates','invitations','conversations'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS account_blob_claims_sync_trg ON public.%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER account_blob_claims_sync_trg AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.account_blob_sync_row_claims()',
      table_name
    );
  END LOOP;
END $$;

-- Registry, claims, queue, and trigger helpers are owner/service only.
DO $$
DECLARE
  target_role text;
  relation_name text;
  column_list text;
  policy_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'account_blob_assets','account_blob_asset_claims','account_asset_erasure_outbox'
  ] LOOP
    SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
    INTO column_list FROM pg_attribute
    WHERE attrelid = format('public.%I', relation_name)::regclass
      AND attnum > 0 AND NOT attisdropped;
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', relation_name);
    EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM PUBLIC', column_list, relation_name);
    FOR target_role IN
      WITH RECURSIVE browser_role_tree(role_oid, role_name) AS (
        SELECT oid, rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')
        UNION
        SELECT parent.oid, parent.rolname FROM browser_role_tree child
        JOIN pg_auth_members membership ON membership.member = child.role_oid
        JOIN pg_roles parent ON parent.oid = membership.roleid
      ) SELECT DISTINCT role_name FROM browser_role_tree ORDER BY role_name
    LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', relation_name, target_role);
      EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM %I', column_list, relation_name, target_role);
    END LOOP;
    FOR policy_name IN SELECT polname FROM pg_policy
      WHERE polrelid = format('public.%I', relation_name)::regclass
    LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', policy_name, relation_name);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', relation_name);
    EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', relation_name);
  END LOOP;

  REVOKE ALL PRIVILEGES ON SEQUENCE public.account_asset_erasure_outbox_id_seq FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON FUNCTION public.account_blob_record_claim(text,text,text,text,uuid) FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON FUNCTION public.account_blob_fence_claim_mutation() FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON FUNCTION public.account_blob_enqueue_unclaimed_orphans() FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON FUNCTION public.account_blob_deferred_orphan_check() FROM PUBLIC;
  REVOKE ALL PRIVILEGES ON FUNCTION public.account_blob_sync_row_claims() FROM PUBLIC;
  FOR target_role IN
    WITH RECURSIVE browser_role_tree(role_oid, role_name) AS (
      SELECT oid, rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')
      UNION
      SELECT parent.oid, parent.rolname FROM browser_role_tree child
      JOIN pg_auth_members membership ON membership.member = child.role_oid
      JOIN pg_roles parent ON parent.oid = membership.roleid
    ) SELECT DISTINCT role_name FROM browser_role_tree ORDER BY role_name
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON SEQUENCE public.account_asset_erasure_outbox_id_seq FROM %I', target_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION public.account_blob_record_claim(text,text,text,text,uuid) FROM %I', target_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION public.account_blob_fence_claim_mutation() FROM %I', target_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION public.account_blob_enqueue_unclaimed_orphans() FROM %I', target_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION public.account_blob_deferred_orphan_check() FROM %I', target_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION public.account_blob_sync_row_claims() FROM %I', target_role);
  END LOOP;
END $$;

DO $$
DECLARE
  browser_role text;
  relation_name text;
  column_name text;
  privilege_name text;
  actual_triggers text[];
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'account_blob_assets','account_blob_asset_claims','account_asset_erasure_outbox'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class WHERE oid = format('public.%I', relation_name)::regclass
        AND (NOT relrowsecurity OR relforcerowsecurity)
    ) OR EXISTS (
      SELECT 1 FROM pg_policy WHERE polrelid = format('public.%I', relation_name)::regclass
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = format('0037 failed policy-free owner-compatible RLS on %s', relation_name);
    END IF;
  END LOOP;

  SELECT array_agg(
    format('%I.%I', namespace.nspname, relation.relname)
    ORDER BY namespace.nspname, relation.relname
  ) INTO actual_triggers
  FROM pg_trigger trigger_row
  JOIN pg_class relation ON relation.oid = trigger_row.tgrelid
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE trigger_row.tgname = 'account_blob_claims_sync_trg'
    AND NOT trigger_row.tgisinternal;
  IF actual_triggers IS DISTINCT FROM ARRAY[
    'public.artist_images','public.artists','public.blog_posts',
    'public.booking_requests','public.categories','public.chat_messages',
    'public.conversations','public.event_photos','public.event_plans',
    'public.invitation_templates','public.invitations','public.reviews',
    'public.users','public.venue_images','public.venues'
  ]::text[] THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '0037 failed to install all Blob claim triggers';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger AS trigger_row
    JOIN pg_class AS relation ON relation.oid = trigger_row.tgrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE trigger_row.tgname = 'account_blob_claims_sync_trg'
      AND NOT trigger_row.tgisinternal
      AND (
        namespace.nspname <> 'public'
        OR trigger_row.tgtype <> 29
        OR trigger_row.tgenabled <> 'O'
        OR trigger_row.tgdeferrable
        OR trigger_row.tginitdeferred
        OR trigger_row.tgconstraint <> 0
        OR trigger_row.tgnargs <> 0
        OR trigger_row.tgqual IS NOT NULL
        OR trigger_row.tgfoid <>
          'public.account_blob_sync_row_claims()'::regprocedure
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0037 failed exact source Blob claim trigger shape';
  END IF;

  IF (SELECT count(*) FROM pg_trigger trigger_row
      WHERE trigger_row.tgrelid = 'public.account_blob_asset_claims'::regclass
        AND trigger_row.tgname = 'account_blob_claim_mutation_fence_trg'
        AND NOT trigger_row.tgisinternal
        AND trigger_row.tgtype = 31
        AND trigger_row.tgenabled = 'O'
        AND NOT trigger_row.tgdeferrable
        AND NOT trigger_row.tginitdeferred
        AND trigger_row.tgconstraint = 0
        AND trigger_row.tgnargs = 0
        AND trigger_row.tgqual IS NULL
        AND trigger_row.tgfoid = 'public.account_blob_fence_claim_mutation()'::regprocedure) <> 1
    OR (SELECT count(*) FROM pg_trigger trigger_row
      WHERE trigger_row.tgrelid = 'public.account_blob_asset_claims'::regclass
        AND trigger_row.tgname = 'account_blob_claim_orphan_check_trg'
        AND NOT trigger_row.tgisinternal
        AND trigger_row.tgtype = 25
        AND trigger_row.tgenabled = 'O'
        AND trigger_row.tgdeferrable AND trigger_row.tginitdeferred
        AND trigger_row.tgconstraint <> 0
        AND trigger_row.tgnargs = 0
        AND trigger_row.tgqual IS NULL
        AND trigger_row.tgfoid = 'public.account_blob_deferred_orphan_check()'::regprocedure) <> 1
    OR (SELECT count(*) FROM pg_trigger trigger_row
      WHERE trigger_row.tgrelid = 'public.account_blob_assets'::regclass
        AND trigger_row.tgname = 'account_blob_owner_orphan_check_trg'
        AND NOT trigger_row.tgisinternal
        AND trigger_row.tgtype = 17
        AND trigger_row.tgenabled = 'O'
        AND trigger_row.tgdeferrable AND trigger_row.tginitdeferred
        AND trigger_row.tgconstraint <> 0
        AND trigger_row.tgnargs = 0
        AND trigger_row.tgqual IS NOT NULL
        AND trigger_row.tgfoid = 'public.account_blob_deferred_orphan_check()'::regprocedure) <> 1
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '0037 failed Blob orphan trigger fencing';
  END IF;
  IF (SELECT array_agg(trigger_row.tgname::text ORDER BY trigger_row.tgname)
      FROM pg_trigger trigger_row
      WHERE trigger_row.tgrelid = 'public.account_blob_asset_claims'::regclass
        AND NOT trigger_row.tgisinternal)
      IS DISTINCT FROM ARRAY[
        'account_blob_claim_mutation_fence_trg',
        'account_blob_claim_orphan_check_trg'
      ]::text[]
    OR (SELECT array_agg(trigger_row.tgname::text ORDER BY trigger_row.tgname)
      FROM pg_trigger trigger_row
      WHERE trigger_row.tgrelid = 'public.account_blob_assets'::regclass
        AND NOT trigger_row.tgisinternal)
      IS DISTINCT FROM ARRAY['account_blob_owner_orphan_check_trg']::text[]
    OR (SELECT array_agg(trigger_row.tgname::text ORDER BY trigger_row.tgname)
      FROM pg_trigger trigger_row
      WHERE trigger_row.tgrelid = 'public.account_asset_erasure_outbox'::regclass
        AND NOT trigger_row.tgisinternal) IS NOT NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '0037 unexpected registry/claim/outbox trigger drift';
  END IF;

  FOR browser_role IN SELECT rolname FROM pg_roles
    WHERE rolname IN ('anon','authenticated') ORDER BY rolname
  LOOP
    FOREACH relation_name IN ARRAY ARRAY[
      'account_blob_assets','account_blob_asset_claims','account_asset_erasure_outbox'
    ] LOOP
      FOREACH privilege_name IN ARRAY ARRAY[
        'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
      ] LOOP
        IF has_table_privilege(browser_role, format('public.%I', relation_name), privilege_name) THEN
          RAISE EXCEPTION USING ERRCODE = '42501',
            MESSAGE = format('0037 effective %s %s privilege on %s', browser_role, privilege_name, relation_name);
        END IF;
      END LOOP;
      FOR column_name IN SELECT attname FROM pg_attribute
        WHERE attrelid = format('public.%I', relation_name)::regclass
          AND attnum > 0 AND NOT attisdropped
      LOOP
        FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] LOOP
          IF has_column_privilege(browser_role, format('public.%I', relation_name), column_name, privilege_name) THEN
            RAISE EXCEPTION USING ERRCODE = '42501',
              MESSAGE = format('0037 effective %s %s privilege on %s.%s', browser_role, privilege_name, relation_name, column_name);
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;
    FOREACH privilege_name IN ARRAY ARRAY['USAGE','SELECT','UPDATE'] LOOP
      IF has_sequence_privilege(browser_role, 'public.account_asset_erasure_outbox_id_seq', privilege_name) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = '0037 effective browser privilege on outbox sequence';
      END IF;
    END LOOP;
    IF has_function_privilege(browser_role, 'public.account_blob_record_claim(text,text,text,text,uuid)', 'EXECUTE')
      OR has_function_privilege(browser_role, 'public.account_blob_fence_claim_mutation()', 'EXECUTE')
      OR has_function_privilege(browser_role, 'public.account_blob_enqueue_unclaimed_orphans()', 'EXECUTE')
      OR has_function_privilege(browser_role, 'public.account_blob_deferred_orphan_check()', 'EXECUTE')
      OR has_function_privilege(browser_role, 'public.account_blob_sync_row_claims()', 'EXECUTE') THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = '0037 effective browser EXECUTE on Blob claim helper';
    END IF;
  END LOOP;
END $$;

COMMIT;
