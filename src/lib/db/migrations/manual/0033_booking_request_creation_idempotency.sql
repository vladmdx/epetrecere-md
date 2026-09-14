-- 0033 — Durable idempotency for booking-request creation.
--
-- Existing/no-key writes remain valid with NULL creation fields. New keyed
-- writes receive one scope/request identity and payload hash. The linked
-- offer-request column lets the application create the booking and its CRM
-- projection atomically. Transactional, idempotent and fail-closed when a
-- same-name object has a non-canonical shape. It also canonicalizes the two
-- legacy CRM target FKs and removes direct browser-role access to both PII
-- tables.
-- Do not apply to Preview/Production without an explicit rollout.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

DO $$
BEGIN
  IF to_regclass('public.booking_requests') IS NULL
    OR to_regclass('public.offer_requests') IS NULL
    OR to_regclass('public.artists') IS NULL
    OR to_regclass('public.venues') IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42P01',
      MESSAGE = '0033 requires public.booking_requests, public.offer_requests, public.artists and public.venues',
      HINT = 'Apply the earlier manual migrations before migration 0033.';
  END IF;
END $$;

-- Changing a legacy FK action requires PostgreSQL to take ACCESS EXCLUSIVE on
-- both the referencing and referenced relations. Acquire the final modes in a
-- deterministic target-first order (rather than upgrading them later). The
-- short lock_timeout makes a busy rollout fail cleanly before any DDL runs.
LOCK TABLE public.artists, public.venues IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.booking_requests, public.offer_requests IN ACCESS EXCLUSIVE MODE;

ALTER TABLE public.booking_requests
  ADD COLUMN IF NOT EXISTS creation_scope_hash text,
  ADD COLUMN IF NOT EXISTS creation_request_id uuid,
  ADD COLUMN IF NOT EXISTS creation_payload_hash text;

ALTER TABLE public.offer_requests
  ADD COLUMN IF NOT EXISTS booking_request_id integer;

-- IF NOT EXISTS never repairs a wrong same-name column. Verify the complete
-- type/null/default/generated shape before installing constraints or indexes.
DO $$
DECLARE invalid_columns text;
BEGIN
  SELECT string_agg(
    format('%s %s nullable=%s default=%s', expected.column_name,
      coalesce(actual.udt_name, '<missing>'), coalesce(actual.is_nullable, '<missing>'),
      coalesce(actual.column_default, '<none>')),
    ', ' ORDER BY expected.column_name
  )
  INTO invalid_columns
  FROM (VALUES
    ('creation_scope_hash', 'text'),
    ('creation_request_id', 'uuid'),
    ('creation_payload_hash', 'text')
  ) AS expected(column_name, udt_name)
  LEFT JOIN information_schema.columns AS actual
    ON actual.table_schema = 'public'
   AND actual.table_name = 'booking_requests'
   AND actual.column_name = expected.column_name
  WHERE actual.column_name IS NULL
     OR actual.udt_name <> expected.udt_name
     OR actual.is_nullable <> 'YES'
     OR actual.column_default IS NOT NULL
     OR actual.is_identity <> 'NO'
     OR actual.is_generated <> 'NEVER';

  IF invalid_columns IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0033 found non-canonical booking_requests creation columns: ' || invalid_columns,
      HINT = 'Restore nullable text/uuid/text columns with no defaults, then re-run 0033.';
  END IF;
END $$;

DO $$
DECLARE invalid_column text;
BEGIN
  SELECT format('%s nullable=%s default=%s', coalesce(udt_name, '<missing>'),
    coalesce(is_nullable, '<missing>'), coalesce(column_default, '<none>'))
  INTO invalid_column
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'offer_requests'
    AND column_name = 'booking_request_id'
    AND (udt_name <> 'int4'
      OR is_nullable <> 'YES'
      OR column_default IS NOT NULL
      OR is_identity <> 'NO'
      OR is_generated <> 'NEVER');

  IF invalid_column IS NOT NULL OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'offer_requests'
      AND column_name = 'booking_request_id'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0033 found a non-canonical offer_requests.booking_request_id: ' || coalesce(invalid_column, '<missing>'),
      HINT = 'Restore a nullable integer column with no default, then re-run 0033.';
  END IF;
END $$;

DO $$
DECLARE invalid_count bigint;
BEGIN
  SELECT count(*) INTO invalid_count
  FROM public.booking_requests
  WHERE NOT (
    (creation_scope_hash IS NULL
      AND creation_request_id IS NULL
      AND creation_payload_hash IS NULL)
    OR
    (creation_scope_hash IS NOT NULL
      AND creation_request_id IS NOT NULL
      AND creation_payload_hash IS NOT NULL)
  );
  IF invalid_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('0033 cannot enforce booking creation-request shape; %s partial rows exist', invalid_count),
      HINT = 'Repair each row to have either all three creation fields NULL or all three populated.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.booking_requests'::regclass
      AND conname = 'booking_requests_creation_request_shape_chk'
  ) THEN
    ALTER TABLE public.booking_requests
      ADD CONSTRAINT booking_requests_creation_request_shape_chk
      CHECK (
        (creation_scope_hash IS NULL
          AND creation_request_id IS NULL
          AND creation_payload_hash IS NULL)
        OR
        (creation_scope_hash IS NOT NULL
          AND creation_request_id IS NOT NULL
          AND creation_payload_hash IS NOT NULL)
      );
  END IF;
END $$;

DO $$
DECLARE expression text; is_valid boolean; is_inheritable boolean;
BEGIN
  SELECT regexp_replace(lower(pg_get_expr(conbin, conrelid)), '[[:space:]()]', '', 'g'),
    convalidated, NOT connoinherit
  INTO expression, is_valid, is_inheritable
  FROM pg_constraint
  WHERE conrelid = 'public.booking_requests'::regclass
    AND conname = 'booking_requests_creation_request_shape_chk'
    AND contype = 'c';

  IF is_valid IS DISTINCT FROM TRUE OR is_inheritable IS DISTINCT FROM TRUE
    OR expression IS DISTINCT FROM
      'creation_scope_hashisnullandcreation_request_idisnullandcreation_payload_hashisnullorcreation_scope_hashisnotnullandcreation_request_idisnotnullandcreation_payload_hashisnotnull'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0033 found a non-canonical booking creation-request check',
      HINT = 'Restore the exact all-NULL-or-all-populated CHECK, then re-run 0033.';
  END IF;
END $$;

DO $$
DECLARE duplicate_summary text;
BEGIN
  SELECT string_agg(format('%s/%s (%s rows)', creation_scope_hash,
    creation_request_id, row_count), ', ' ORDER BY creation_scope_hash, creation_request_id)
  INTO duplicate_summary
  FROM (
    SELECT creation_scope_hash, creation_request_id, count(*) AS row_count
    FROM public.booking_requests
    WHERE creation_scope_hash IS NOT NULL AND creation_request_id IS NOT NULL
    GROUP BY creation_scope_hash, creation_request_id
    HAVING count(*) > 1
    LIMIT 10
  ) AS duplicate_key;
  IF duplicate_summary IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = '0033 cannot enforce booking creation idempotency; duplicates exist: ' || duplicate_summary,
      HINT = 'Resolve each scope/request key to one canonical booking before retrying 0033.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS booking_requests_creation_scope_request_uidx
  ON public.booking_requests (creation_scope_hash, creation_request_id)
  WHERE creation_scope_hash IS NOT NULL AND creation_request_id IS NOT NULL;

DO $$
DECLARE index_is_canonical boolean;
BEGIN
  SELECT idx.indisunique AND idx.indisvalid AND idx.indisready AND idx.indislive
    AND NOT idx.indisprimary AND NOT idx.indisexclusion AND idx.indimmediate
    AND NOT idx.indisclustered AND NOT idx.indisreplident
    AND idx.indexprs IS NULL
    AND idx.indnkeyatts = 2 AND idx.indnatts = 2
    AND idx.indkey[0] = scope_attribute.attnum
    AND idx.indkey[1] = request_attribute.attnum
    AND idx.indclass[0] = scope_operator_class.oid
    AND idx.indclass[1] = request_operator_class.oid
    AND scope_operator_class.opcdefault
    AND request_operator_class.opcdefault
    AND scope_operator_class.opcmethod = access_method.oid
    AND request_operator_class.opcmethod = access_method.oid
    AND scope_operator_class.opcintype = scope_attribute.atttypid
    AND request_operator_class.opcintype = request_attribute.atttypid
    AND idx.indcollation[0] = scope_attribute.attcollation
    AND idx.indcollation[1] = request_attribute.attcollation
    AND idx.indoption[0] = 0 AND idx.indoption[1] = 0
    AND index_relation.reltablespace = 0
    AND index_relation.reloptions IS NULL
    AND access_method.amname = 'btree'
    AND regexp_replace(lower(pg_get_expr(idx.indpred, idx.indrelid)), '[[:space:]()]', '', 'g') =
      'creation_scope_hashisnotnullandcreation_request_idisnotnull'
  INTO index_is_canonical
  FROM pg_class AS index_relation
  JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
  JOIN pg_am AS access_method ON access_method.oid = index_relation.relam
  JOIN pg_index AS idx ON idx.indexrelid = index_relation.oid
  JOIN pg_attribute AS scope_attribute
    ON scope_attribute.attrelid = idx.indrelid AND scope_attribute.attname = 'creation_scope_hash'
  JOIN pg_attribute AS request_attribute
    ON request_attribute.attrelid = idx.indrelid AND request_attribute.attname = 'creation_request_id'
  JOIN pg_opclass AS scope_operator_class
    ON scope_operator_class.oid = idx.indclass[0]
  JOIN pg_opclass AS request_operator_class
    ON request_operator_class.oid = idx.indclass[1]
  WHERE index_namespace.nspname = 'public'
    AND index_relation.relname = 'booking_requests_creation_scope_request_uidx'
    AND idx.indrelid = 'public.booking_requests'::regclass;

  IF index_is_canonical IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0033 found a non-canonical booking creation-request index',
      HINT = 'The canonical index is UNIQUE (creation_scope_hash, creation_request_id) WHERE both are NOT NULL.';
  END IF;
END $$;

-- Existing offer rows are intentionally unlinked. A pre-existing populated
-- column without its FK must not be allowed to hide orphaned data.
DO $$
DECLARE orphan_count bigint;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM public.offer_requests AS offer
  LEFT JOIN public.booking_requests AS booking ON booking.id = offer.booking_request_id
  WHERE offer.booking_request_id IS NOT NULL AND booking.id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = format('0033 cannot link offer requests; %s orphan booking_request_id values exist', orphan_count),
      HINT = 'Audit and clear or repair orphan offer links before retrying 0033.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.offer_requests'::regclass
      AND conname = 'offer_requests_booking_request_fk'
  ) THEN
    ALTER TABLE public.offer_requests
      ADD CONSTRAINT offer_requests_booking_request_fk
      FOREIGN KEY (booking_request_id)
      REFERENCES public.booking_requests(id)
      ON UPDATE NO ACTION
      ON DELETE CASCADE
      NOT DEFERRABLE;
  END IF;
END $$;

DO $$
DECLARE
  source_attnum smallint;
  target_attnum smallint;
  related_fk_count integer;
  canonical_fk_count integer;
  related_fk_summary text;
BEGIN
  SELECT attnum INTO source_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.offer_requests'::regclass
    AND attname = 'booking_request_id'
    AND NOT attisdropped;
  SELECT attnum INTO target_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.booking_requests'::regclass
    AND attname = 'id'
    AND NOT attisdropped;

  SELECT count(*)::integer,
    count(*) FILTER (
      WHERE fk.conname = 'offer_requests_booking_request_fk'
        AND fk.conkey = ARRAY[source_attnum]::smallint[]
        AND fk.confrelid = 'public.booking_requests'::regclass
        AND fk.confkey = ARRAY[target_attnum]::smallint[]
        AND fk.confdeltype = 'c'
        AND fk.confupdtype = 'a'
        AND fk.confmatchtype = 's'
        AND NOT fk.condeferrable
        AND NOT fk.condeferred
        AND fk.convalidated
        AND fk.conislocal
        AND fk.coninhcount = 0
        AND fk.conparentid = 0
    )::integer,
    string_agg(
      format('%s columns=%s', fk.conname, fk.conkey::text),
      ', ' ORDER BY fk.conname
    )
  INTO related_fk_count, canonical_fk_count, related_fk_summary
  FROM pg_constraint AS fk
  WHERE fk.conrelid = 'public.offer_requests'::regclass
    AND fk.contype = 'f'
    AND source_attnum = ANY(fk.conkey);

  IF related_fk_count <> 1 OR canonical_fk_count <> 1 THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0033 found non-canonical or additional offer-to-booking foreign keys: '
        || coalesce(related_fk_summary, '<none>'),
      HINT = 'Exactly one canonical single-column FK is allowed: booking_request_id -> booking_requests(id) ON UPDATE NO ACTION ON DELETE CASCADE NOT DEFERRABLE.';
  END IF;
END $$;

DO $$
DECLARE duplicate_summary text;
BEGIN
  SELECT string_agg(format('%s (%s rows)', booking_request_id, row_count),
    ', ' ORDER BY booking_request_id)
  INTO duplicate_summary
  FROM (
    SELECT booking_request_id, count(*) AS row_count
    FROM public.offer_requests
    WHERE booking_request_id IS NOT NULL
    GROUP BY booking_request_id
    HAVING count(*) > 1
    LIMIT 10
  ) AS duplicate_key;
  IF duplicate_summary IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = '0033 cannot enforce one offer per booking; duplicates exist: ' || duplicate_summary,
      HINT = 'Resolve each booking to one canonical offer before retrying 0033.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS offer_requests_booking_request_uidx
  ON public.offer_requests (booking_request_id)
  WHERE booking_request_id IS NOT NULL;

DO $$
DECLARE index_is_canonical boolean;
BEGIN
  SELECT idx.indisunique AND idx.indisvalid AND idx.indisready AND idx.indislive
    AND NOT idx.indisprimary AND NOT idx.indisexclusion AND idx.indimmediate
    AND NOT idx.indisclustered AND NOT idx.indisreplident
    AND idx.indexprs IS NULL
    AND idx.indnkeyatts = 1 AND idx.indnatts = 1
    AND idx.indkey[0] = booking_attribute.attnum
    AND idx.indclass[0] = booking_operator_class.oid
    AND booking_operator_class.opcdefault
    AND booking_operator_class.opcmethod = access_method.oid
    AND booking_operator_class.opcintype = booking_attribute.atttypid
    AND idx.indcollation[0] = booking_attribute.attcollation
    AND idx.indoption[0] = 0
    AND index_relation.reltablespace = 0
    AND index_relation.reloptions IS NULL
    AND access_method.amname = 'btree'
    AND regexp_replace(lower(pg_get_expr(idx.indpred, idx.indrelid)), '[[:space:]()]', '', 'g') =
      'booking_request_idisnotnull'
  INTO index_is_canonical
  FROM pg_class AS index_relation
  JOIN pg_namespace AS index_namespace ON index_namespace.oid = index_relation.relnamespace
  JOIN pg_am AS access_method ON access_method.oid = index_relation.relam
  JOIN pg_index AS idx ON idx.indexrelid = index_relation.oid
  JOIN pg_attribute AS booking_attribute
    ON booking_attribute.attrelid = idx.indrelid AND booking_attribute.attname = 'booking_request_id'
  JOIN pg_opclass AS booking_operator_class
    ON booking_operator_class.oid = idx.indclass[0]
  WHERE index_namespace.nspname = 'public'
    AND index_relation.relname = 'offer_requests_booking_request_uidx'
    AND idx.indrelid = 'public.offer_requests'::regclass;

  IF index_is_canonical IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0033 found a non-canonical offer booking-request index',
      HINT = 'The canonical index is UNIQUE (booking_request_id) WHERE booking_request_id IS NOT NULL.';
  END IF;
END $$;

-- The CRM projection is part of the booking audit trail. Removing an artist
-- or venue must detach its live target, not erase the linked lead. Canonicalize
-- each exact legacy single-column CASCADE FK to nullable SET NULL. Composite,
-- duplicate, or unexpected same-column FKs are ambiguous and fail closed.
DO $$
DECLARE
  target record;
  source_attnum smallint;
  target_attnum smallint;
  existing_fk record;
  canonical_present boolean;
  orphan_count bigint;
  related_fk_count integer;
  composite_fk_count integer;
  related_fk_summary text;
  canonical_count integer;
BEGIN
  FOR target IN
    SELECT * FROM (VALUES
      ('artist_id'::text, 'artists'::text,
        'offer_requests_artist_id_artists_id_fk'::text),
      ('venue_id'::text, 'venues'::text,
        'offer_requests_venue_id_venues_id_fk'::text)
    ) AS specification(column_name, target_table, constraint_name)
  LOOP
    SELECT attribute.attnum,
      NOT attribute.attnotnull AND attribute.atttypid = 'integer'::regtype
    INTO source_attnum, canonical_present
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = 'public.offer_requests'::regclass
      AND attribute.attname = target.column_name
      AND NOT attribute.attisdropped;
    IF source_attnum IS NULL OR canonical_present IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = format(
          '0033 requires nullable offer_requests.%s',
          target.column_name
        );
    END IF;

    SELECT attribute.attnum
    INTO target_attnum
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = to_regclass('public.' || target.target_table)
      AND attribute.attname = 'id'
      AND attribute.atttypid = 'integer'::regtype
      AND NOT attribute.attisdropped;
    IF target_attnum IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '42P01',
        MESSAGE = format(
          '0033 requires public.%s(id)',
          target.target_table
        );
    END IF;

    SELECT count(*)::integer,
      count(*) FILTER (
        WHERE fk.conkey IS DISTINCT FROM ARRAY[source_attnum]::smallint[]
      )::integer,
      string_agg(
        format('%s columns=%s', fk.conname, fk.conkey::text),
        ', ' ORDER BY fk.conname
      )
    INTO related_fk_count, composite_fk_count, related_fk_summary
    FROM pg_constraint AS fk
    WHERE fk.conrelid = 'public.offer_requests'::regclass
      AND fk.contype = 'f'
      AND source_attnum = ANY(fk.conkey);

    IF related_fk_count > 1 OR composite_fk_count > 0 THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = format(
          '0033 found composite or additional FKs involving offer_requests.%s: %s',
          target.column_name,
          coalesce(related_fk_summary, '<none>')
        ),
        HINT = 'Keep at most one exact single-column legacy FK on this target column before retrying 0033.';
    END IF;

    canonical_present := false;
    FOR existing_fk IN
      SELECT fk.conname, fk.conkey, fk.confrelid, fk.confkey, fk.confdeltype,
        fk.confupdtype, fk.confmatchtype, fk.condeferrable, fk.condeferred,
        fk.convalidated, fk.conislocal, fk.coninhcount, fk.conparentid
      FROM pg_constraint AS fk
      WHERE fk.conrelid = 'public.offer_requests'::regclass
        AND fk.contype = 'f'
        AND source_attnum = ANY(fk.conkey)
    LOOP
      IF existing_fk.conkey IS DISTINCT FROM
          ARRAY[source_attnum]::smallint[]
        OR existing_fk.confrelid IS DISTINCT FROM
          to_regclass('public.' || target.target_table)
        OR existing_fk.confkey IS DISTINCT FROM
          ARRAY[target_attnum]::smallint[]
      THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = format(
            '0033 found unexpected FK %s on offer_requests.%s',
            existing_fk.conname,
            target.column_name
          );
      END IF;

      IF existing_fk.conname = target.constraint_name
        AND existing_fk.confdeltype = 'n'
        AND existing_fk.confupdtype = 'a'
        AND existing_fk.confmatchtype = 's'
        AND NOT existing_fk.condeferrable
        AND NOT existing_fk.condeferred
        AND existing_fk.convalidated
        AND existing_fk.conislocal
        AND existing_fk.coninhcount = 0
        AND existing_fk.conparentid = 0
      THEN
        canonical_present := true;
      ELSE
        EXECUTE format(
          'ALTER TABLE public.offer_requests DROP CONSTRAINT %I',
          existing_fk.conname
        );
      END IF;
    END LOOP;

    IF NOT canonical_present THEN
      EXECUTE format(
        'SELECT count(*) FROM public.offer_requests AS offer '
        || 'LEFT JOIN public.%I AS target ON target.id = offer.%I '
        || 'WHERE offer.%I IS NOT NULL AND target.id IS NULL',
        target.target_table,
        target.column_name,
        target.column_name
      ) INTO orphan_count;
      IF orphan_count > 0 THEN
        RAISE EXCEPTION USING
          ERRCODE = '23503',
          MESSAGE = format(
            '0033 cannot restore offer_requests.%s FK; %s orphan rows exist',
            target.column_name,
            orphan_count
          );
      END IF;
      EXECUTE format(
        'ALTER TABLE public.offer_requests ADD CONSTRAINT %I '
        || 'FOREIGN KEY (%I) REFERENCES public.%I(id) '
        || 'ON UPDATE NO ACTION ON DELETE SET NULL NOT DEFERRABLE',
        target.constraint_name,
        target.column_name,
        target.target_table
      );
    END IF;

    SELECT count(*) FILTER (
      WHERE fk.conname = target.constraint_name
        AND fk.conkey = ARRAY[source_attnum]::smallint[]
        AND fk.confrelid = to_regclass('public.' || target.target_table)
        AND fk.confkey = ARRAY[target_attnum]::smallint[]
        AND fk.confdeltype = 'n'
        AND fk.confupdtype = 'a'
        AND fk.confmatchtype = 's'
        AND NOT fk.condeferrable
        AND NOT fk.condeferred
        AND fk.convalidated
        AND fk.conislocal
        AND fk.coninhcount = 0
        AND fk.conparentid = 0
      )::integer,
      count(*)::integer
    INTO canonical_count, related_fk_count
    FROM pg_constraint AS fk
    WHERE fk.conrelid = 'public.offer_requests'::regclass
      AND fk.contype = 'f'
      AND source_attnum = ANY(fk.conkey);
    IF canonical_count <> 1 OR related_fk_count <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = format(
          '0033 failed to canonicalize offer_requests.%s foreign key',
          target.column_name
        );
    END IF;
  END LOOP;
END $$;

-- Both tables predate the hardened multi-Hall schema and contain client PII.
-- New idempotency material must not be browser-writable. Revoke only grants
-- owned by this surface (PUBLIC and the two browser roles themselves); never
-- mutate an inherited parent role whose ACL can serve unrelated members. The
-- effective-privilege audit below aborts if inheritance still exposes data.
DO $$
DECLARE
  target_table text;
  sequence_name text;
  role_name text;
  column_list text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['booking_requests', 'offer_requests'] LOOP
    SELECT string_agg(quote_ident(attribute.attname), ', ' ORDER BY attribute.attnum)
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

    FOR role_name IN
      SELECT role.rolname
      FROM pg_roles AS role
      WHERE role.rolname IN ('anon', 'authenticated')
    LOOP
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I',
        target_table,
        role_name
      );
      EXECUTE format(
        'REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I FROM %I',
        column_list,
        target_table,
        role_name
      );
    END LOOP;
  END LOOP;

  FOREACH sequence_name IN ARRAY ARRAY[
    'booking_requests_id_seq',
    'offer_requests_id_seq'
  ] LOOP
    IF to_regclass(format('public.%I', sequence_name)) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM PUBLIC',
        sequence_name
      );
      FOR role_name IN
        SELECT role.rolname
        FROM pg_roles AS role
        WHERE role.rolname IN ('anon', 'authenticated')
      LOOP
        EXECUTE format(
          'REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM %I',
          sequence_name,
          role_name
        );
      END LOOP;
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_requests NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.offer_requests NO FORCE ROW LEVEL SECURITY;

-- REVOKE cannot override superuser/ownership or membership in one of the
-- predefined broad read/write roles. Refuse to commit if either browser role
-- would still have an effective path to these PII tables or their sequences.
DO $$
DECLARE
  role_name text;
  target_table text;
  sequence_name text;
  column_name text;
  privilege_name text;
  leaked boolean;
BEGIN
  FOR role_name IN
    SELECT role.rolname
    FROM pg_roles AS role
    WHERE role.rolname IN ('anon', 'authenticated')
  LOOP
    FOREACH target_table IN ARRAY ARRAY['booking_requests', 'offer_requests'] LOOP
      leaked := false;
      FOREACH privilege_name IN ARRAY ARRAY[
        'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
        'REFERENCES', 'TRIGGER'
      ] LOOP
        IF has_table_privilege(
          role_name,
          format('public.%I', target_table),
          privilege_name
        ) THEN
          leaked := true;
          EXIT;
        END IF;
      END LOOP;

      IF NOT leaked THEN
        FOR column_name IN
          SELECT attribute.attname
          FROM pg_attribute AS attribute
          WHERE attribute.attrelid = format('public.%I', target_table)::regclass
            AND attribute.attnum > 0
            AND NOT attribute.attisdropped
        LOOP
          FOREACH privilege_name IN ARRAY ARRAY[
            'SELECT', 'INSERT', 'UPDATE', 'REFERENCES'
          ] LOOP
            IF has_column_privilege(
              role_name,
              format('public.%I', target_table),
              column_name,
              privilege_name
            ) THEN
              leaked := true;
              EXIT;
            END IF;
          END LOOP;
          EXIT WHEN leaked;
        END LOOP;
      END IF;

      IF leaked THEN
        RAISE EXCEPTION USING
          ERRCODE = '42501',
          MESSAGE = format(
            '0033 could not remove effective %s privileges from public.%s',
            role_name,
            target_table
          ),
          HINT = 'Remove the inherited/broad grant or unsafe role membership outside this migration, then retry; 0033 does not mutate parent-role ACLs.';
      END IF;
    END LOOP;

    FOREACH sequence_name IN ARRAY ARRAY[
      'booking_requests_id_seq',
      'offer_requests_id_seq'
    ] LOOP
      IF to_regclass(format('public.%I', sequence_name)) IS NOT NULL THEN
        leaked := false;
        FOREACH privilege_name IN ARRAY ARRAY['USAGE', 'SELECT', 'UPDATE'] LOOP
          IF has_sequence_privilege(
            role_name,
            format('public.%I', sequence_name),
            privilege_name
          ) THEN
            leaked := true;
            EXIT;
          END IF;
        END LOOP;
        IF leaked THEN
          RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = format(
              '0033 could not remove effective %s privileges from public.%s',
              role_name,
              sequence_name
            ),
            HINT = 'Remove the inherited/broad grant or unsafe role membership outside this migration, then retry; 0033 does not mutate parent-role ACLs.';
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END $$;

COMMENT ON COLUMN public.booking_requests.creation_scope_hash IS
  'SHA-256 server-side actor scope for POST /booking-requests idempotency.';
COMMENT ON COLUMN public.booking_requests.creation_request_id IS
  'Caller UUID from Idempotency-Key; meaningful only with both creation hashes.';
COMMENT ON COLUMN public.booking_requests.creation_payload_hash IS
  'SHA-256 of canonical booking-create intent; detects key reuse with changed input.';
COMMENT ON COLUMN public.offer_requests.booking_request_id IS
  'Atomic one-to-one CRM projection link for a booking request; NULL for legacy/direct offers.';

COMMIT;
