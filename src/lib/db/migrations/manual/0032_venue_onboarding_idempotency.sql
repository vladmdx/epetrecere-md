-- 0032 — Durable idempotency for explicit organization/venue/hall onboarding.
--
-- A browser-generated UUID survives refresh/retry. Actor-scoped organization
-- organization-scoped venue, and venue-scoped hall indexes ensure concurrent
-- submissions and retries after a lost HTTP response resolve to one durable row. SQL is
-- additive and idempotent.
-- Do not apply to Preview/Production without an explicit rollout.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS onboarding_submission_id uuid,
  ADD COLUMN IF NOT EXISTS onboarding_submission_hash text;

ALTER TABLE public.partner_organizations
  ADD COLUMN IF NOT EXISTS creation_actor_user_id uuid,
  ADD COLUMN IF NOT EXISTS creation_request_id uuid,
  ADD COLUMN IF NOT EXISTS creation_request_hash text;

ALTER TABLE public.venue_halls
  ADD COLUMN IF NOT EXISTS creation_request_id uuid,
  ADD COLUMN IF NOT EXISTS creation_payload_hash text;

-- ADD COLUMN IF NOT EXISTS does not repair a same-name column with the wrong
-- type/nullability. Refuse that ambiguous baseline before creating guarantees
-- which application code would otherwise incorrectly assume are present.
DO $$
DECLARE
  invalid_columns text;
BEGIN
  SELECT string_agg(
    format(
      '%s %s nullable=%s default=%s',
      expected.column_name,
      actual.udt_name,
      actual.is_nullable,
      coalesce(actual.column_default, '<none>')
    ),
    ', '
    ORDER BY expected.column_name
  )
  INTO invalid_columns
  FROM (VALUES
    ('creation_actor_user_id', 'uuid'),
    ('creation_request_id', 'uuid'),
    ('creation_request_hash', 'text')
  ) AS expected(column_name, udt_name)
  LEFT JOIN information_schema.columns AS actual
    ON actual.table_schema = 'public'
   AND actual.table_name = 'partner_organizations'
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
      MESSAGE = '0032 found non-canonical partner_organizations creation columns: ' || invalid_columns,
      HINT = 'Restore nullable uuid/uuid/text creation columns, then re-run migration 0032.';
  END IF;
END $$;

DO $$
DECLARE
  invalid_columns text;
BEGIN
  SELECT string_agg(
    format(
      '%s %s nullable=%s default=%s',
      expected.column_name,
      actual.udt_name,
      actual.is_nullable,
      coalesce(actual.column_default, '<none>')
    ),
    ', '
    ORDER BY expected.column_name
  )
  INTO invalid_columns
  FROM (VALUES
    ('onboarding_submission_id', 'uuid'),
    ('onboarding_submission_hash', 'text')
  ) AS expected(column_name, udt_name)
  LEFT JOIN information_schema.columns AS actual
    ON actual.table_schema = 'public'
   AND actual.table_name = 'venues'
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
      MESSAGE = '0032 found non-canonical venues onboarding columns: ' || invalid_columns,
      HINT = 'Restore nullable uuid/text columns with no defaults, then re-run migration 0032.';
  END IF;
END $$;

DO $$
DECLARE
  invalid_columns text;
BEGIN
  SELECT string_agg(
    format(
      '%s %s nullable=%s default=%s',
      expected.column_name,
      actual.udt_name,
      actual.is_nullable,
      coalesce(actual.column_default, '<none>')
    ),
    ', '
    ORDER BY expected.column_name
  )
  INTO invalid_columns
  FROM (VALUES
    ('creation_request_id', 'uuid'),
    ('creation_payload_hash', 'text')
  ) AS expected(column_name, udt_name)
  LEFT JOIN information_schema.columns AS actual
    ON actual.table_schema = 'public'
   AND actual.table_name = 'venue_halls'
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
      MESSAGE = '0032 found non-canonical venue_halls creation columns: ' || invalid_columns,
      HINT = 'Restore nullable uuid/text columns with no defaults, then re-run migration 0032.';
  END IF;
END $$;

DO $$
DECLARE
  invalid_count bigint;
BEGIN
  SELECT count(*)
  INTO invalid_count
  FROM public.venues
  WHERE NOT (
    (onboarding_submission_id IS NULL AND onboarding_submission_hash IS NULL)
    OR (
      onboarding_submission_id IS NOT NULL
      AND onboarding_submission_hash IS NOT NULL
      AND organization_id IS NOT NULL
    )
  );
  IF invalid_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('0032 cannot enforce venue onboarding request shape; %s invalid rows exist', invalid_count),
      HINT = 'Repair each venue to have either no onboarding identity or an organization-scoped id/hash pair.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.partner_organizations'::regclass
      AND conname = 'partner_organizations_creation_actor_user_id_fkey'
  ) THEN
    ALTER TABLE public.partner_organizations
      ADD CONSTRAINT partner_organizations_creation_actor_user_id_fkey
      FOREIGN KEY (creation_actor_user_id)
      REFERENCES public.users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- A same-name constraint may predate this migration. Verify its complete
-- catalog shape instead of trusting its name.
DO $$
DECLARE
  fk_is_canonical boolean;
BEGIN
  SELECT
    creation_fk.contype = 'f'
    AND creation_fk.convalidated
    AND creation_fk.confrelid = 'public.users'::regclass
    AND creation_fk.confdeltype = 'n'
    AND cardinality(creation_fk.conkey) = 1
    AND cardinality(creation_fk.confkey) = 1
    AND source_attribute.attname = 'creation_actor_user_id'
    AND target_attribute.attname = 'id'
  INTO fk_is_canonical
  FROM pg_constraint AS creation_fk
  JOIN pg_attribute AS source_attribute
    ON source_attribute.attrelid = creation_fk.conrelid
   AND source_attribute.attnum = creation_fk.conkey[1]
  JOIN pg_attribute AS target_attribute
    ON target_attribute.attrelid = creation_fk.confrelid
   AND target_attribute.attnum = creation_fk.confkey[1]
  WHERE creation_fk.conrelid = 'public.partner_organizations'::regclass
    AND creation_fk.conname = 'partner_organizations_creation_actor_user_id_fkey';

  IF fk_is_canonical IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0032 found a non-canonical organization creation-actor foreign key',
      HINT = 'The canonical FK is creation_actor_user_id -> users(id) ON DELETE SET NULL.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.partner_organizations'::regclass
      AND conname = 'partner_organizations_creation_request_shape_chk'
  ) THEN
    ALTER TABLE public.partner_organizations
      ADD CONSTRAINT partner_organizations_creation_request_shape_chk
      CHECK (
        (
          creation_actor_user_id IS NULL
          AND creation_request_id IS NULL
          AND creation_request_hash IS NULL
        )
        OR (
          creation_request_id IS NOT NULL
          AND creation_request_hash IS NOT NULL
        )
      );
  END IF;
END $$;

DO $$
DECLARE
  creation_check text;
  check_is_validated boolean;
  check_is_inheritable boolean;
BEGIN
  SELECT regexp_replace(
    lower(pg_get_expr(conbin, conrelid)),
    '[[:space:]()]',
    '',
    'g'
  ), convalidated, NOT connoinherit
  INTO creation_check, check_is_validated, check_is_inheritable
  FROM pg_constraint
  WHERE conrelid = 'public.partner_organizations'::regclass
    AND conname = 'partner_organizations_creation_request_shape_chk'
    AND contype = 'c';

  IF check_is_validated IS DISTINCT FROM TRUE
    OR check_is_inheritable IS DISTINCT FROM TRUE
    OR creation_check IS DISTINCT FROM
      'creation_actor_user_idisnullandcreation_request_idisnullandcreation_request_hashisnullorcreation_request_idisnotnullandcreation_request_hashisnotnull'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0032 found a non-canonical organization creation-request check',
      HINT = 'The canonical check allows either all NULL, or a request id/hash pair; actor NULL is retained after ON DELETE SET NULL.';
  END IF;
END $$;

DO $$
DECLARE
  duplicate_summary text;
BEGIN
  SELECT string_agg(
    format('%s/%s (%s rows)', duplicate_key.creation_actor_user_id, duplicate_key.creation_request_id, duplicate_key.row_count),
    ', '
    ORDER BY duplicate_key.creation_actor_user_id, duplicate_key.creation_request_id
  )
  INTO duplicate_summary
  FROM (
    SELECT creation_actor_user_id, creation_request_id, count(*) AS row_count
    FROM public.partner_organizations
    WHERE creation_actor_user_id IS NOT NULL
      AND creation_request_id IS NOT NULL
    GROUP BY creation_actor_user_id, creation_request_id
    HAVING count(*) > 1
    LIMIT 10
  ) AS duplicate_key;

  IF duplicate_summary IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = '0032 cannot enforce organization creation idempotency; duplicates exist: ' || duplicate_summary,
      HINT = 'Resolve each actor/request key to one canonical organization, then re-run migration 0032.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS partner_organizations_actor_creation_request_uidx
  ON public.partner_organizations (creation_actor_user_id, creation_request_id)
  WHERE creation_actor_user_id IS NOT NULL AND creation_request_id IS NOT NULL;

DO $$
DECLARE
  index_is_canonical boolean;
BEGIN
  SELECT
    creation_index.indisunique
    AND creation_index.indisvalid
    AND creation_index.indisready
    AND NOT creation_index.indisprimary
    AND creation_index.indexprs IS NULL
    AND creation_index.indnkeyatts = 2
    AND creation_index.indnatts = 2
    AND creation_index.indkey[0] = actor_attribute.attnum
    AND creation_index.indkey[1] = request_attribute.attnum
    AND access_method.amname = 'btree'
    AND regexp_replace(
      lower(pg_get_expr(creation_index.indpred, creation_index.indrelid)),
      '[[:space:]()]',
      '',
      'g'
    ) = 'creation_actor_user_idisnotnullandcreation_request_idisnotnull'
  INTO index_is_canonical
  FROM pg_class AS index_relation
  JOIN pg_namespace AS index_namespace
    ON index_namespace.oid = index_relation.relnamespace
  JOIN pg_am AS access_method
    ON access_method.oid = index_relation.relam
  JOIN pg_index AS creation_index
    ON creation_index.indexrelid = index_relation.oid
  JOIN pg_attribute AS actor_attribute
    ON actor_attribute.attrelid = creation_index.indrelid
   AND actor_attribute.attname = 'creation_actor_user_id'
  JOIN pg_attribute AS request_attribute
    ON request_attribute.attrelid = creation_index.indrelid
   AND request_attribute.attname = 'creation_request_id'
  WHERE index_namespace.nspname = 'public'
    AND index_relation.relname = 'partner_organizations_actor_creation_request_uidx'
    AND creation_index.indrelid = 'public.partner_organizations'::regclass;

  IF index_is_canonical IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0032 found a non-canonical organization creation-request index',
      HINT = 'The canonical index is UNIQUE (creation_actor_user_id, creation_request_id) WHERE both are NOT NULL.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.venues'::regclass
      AND conname = 'venues_onboarding_submission_shape_chk'
  ) THEN
    ALTER TABLE public.venues
      ADD CONSTRAINT venues_onboarding_submission_shape_chk
      CHECK (
        (onboarding_submission_id IS NULL AND onboarding_submission_hash IS NULL)
        OR (
          onboarding_submission_id IS NOT NULL
          AND onboarding_submission_hash IS NOT NULL
          AND organization_id IS NOT NULL
        )
      );
  END IF;
END $$;

DO $$
DECLARE
  venue_check text;
  check_is_validated boolean;
  check_is_inheritable boolean;
BEGIN
  SELECT regexp_replace(
    lower(pg_get_expr(conbin, conrelid)),
    '[[:space:]()]',
    '',
    'g'
  ), convalidated, NOT connoinherit
  INTO venue_check, check_is_validated, check_is_inheritable
  FROM pg_constraint
  WHERE conrelid = 'public.venues'::regclass
    AND conname = 'venues_onboarding_submission_shape_chk'
    AND contype = 'c';

  IF check_is_validated IS DISTINCT FROM TRUE
    OR check_is_inheritable IS DISTINCT FROM TRUE
    OR venue_check IS DISTINCT FROM
      'onboarding_submission_idisnullandonboarding_submission_hashisnulloronboarding_submission_idisnotnullandonboarding_submission_hashisnotnullandorganization_idisnotnull'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0032 found a non-canonical venue onboarding-submission check',
      HINT = 'Restore the exact NULL-or-organization-scoped id/hash CHECK, then re-run migration 0032.';
  END IF;
END $$;

-- Role selection and the legacy venue-registration endpoint serialize on the
-- application user. This database invariant is the final guard for a rolling
-- deployment or any writer that does not yet participate in that lock.
DO $$
DECLARE
  duplicate_summary text;
BEGIN
  SELECT string_agg(
    format('%s (%s rows)', duplicate_owner.user_id, duplicate_owner.venue_count),
    ', '
    ORDER BY duplicate_owner.user_id
  )
  INTO duplicate_summary
  FROM (
    SELECT user_id, count(*) AS venue_count
    FROM public.venues
    WHERE user_id IS NOT NULL
    GROUP BY user_id
    HAVING count(*) > 1
    ORDER BY user_id
    LIMIT 10
  ) AS duplicate_owner;

  IF duplicate_summary IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = '0032 cannot enforce unique venues.user_id; duplicate legacy owners exist: ' || duplicate_summary,
      HINT = 'Resolve each listed user to one canonical legacy venue, clear user_id on the others, then re-run migration 0032.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS venues_user_id_not_null_uidx
  ON public.venues (user_id)
  WHERE user_id IS NOT NULL;

-- IF NOT EXISTS deliberately does not replace an object that already has
-- this name. Refuse a same-name/wrong-shape index instead of silently
-- reporting success without the ownership guarantee.
DO $$
DECLARE
  index_is_canonical boolean;
BEGIN
  SELECT
    venue_owner_index.indisunique
    AND venue_owner_index.indisvalid
    AND venue_owner_index.indisready
    AND NOT venue_owner_index.indisprimary
    AND venue_owner_index.indexprs IS NULL
    AND venue_owner_index.indnkeyatts = 1
    AND venue_owner_index.indnatts = 1
    AND venue_owner_index.indkey[0] = user_id_attribute.attnum
    AND access_method.amname = 'btree'
    AND regexp_replace(
      lower(pg_get_expr(venue_owner_index.indpred, venue_owner_index.indrelid)),
      '[[:space:]()]',
      '',
      'g'
    ) = 'user_idisnotnull'
  INTO index_is_canonical
  FROM pg_class AS index_relation
  JOIN pg_namespace AS index_namespace
    ON index_namespace.oid = index_relation.relnamespace
  JOIN pg_am AS access_method
    ON access_method.oid = index_relation.relam
  JOIN pg_index AS venue_owner_index
    ON venue_owner_index.indexrelid = index_relation.oid
  JOIN pg_attribute AS user_id_attribute
    ON user_id_attribute.attrelid = venue_owner_index.indrelid
   AND user_id_attribute.attname = 'user_id'
  WHERE index_namespace.nspname = 'public'
    AND index_relation.relname = 'venues_user_id_not_null_uidx'
    AND venue_owner_index.indrelid = 'public.venues'::regclass;

  IF index_is_canonical IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0032 found a non-canonical public.venues_user_id_not_null_uidx',
      HINT = 'Drop or rename the conflicting index, then re-run migration 0032; the canonical index is UNIQUE (user_id) WHERE user_id IS NOT NULL.';
  END IF;
END $$;

DO $$
DECLARE
  duplicate_summary text;
BEGIN
  SELECT string_agg(
    format('%s/%s (%s rows)', duplicate_key.organization_id, duplicate_key.onboarding_submission_id, duplicate_key.row_count),
    ', '
    ORDER BY duplicate_key.organization_id, duplicate_key.onboarding_submission_id
  )
  INTO duplicate_summary
  FROM (
    SELECT organization_id, onboarding_submission_id, count(*) AS row_count
    FROM public.venues
    WHERE onboarding_submission_id IS NOT NULL
    GROUP BY organization_id, onboarding_submission_id
    HAVING count(*) > 1
    LIMIT 10
  ) AS duplicate_key;

  IF duplicate_summary IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = '0032 cannot enforce venue onboarding idempotency; duplicates exist: ' || duplicate_summary,
      HINT = 'Resolve each organization/request key to one canonical venue, then re-run migration 0032.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS venues_org_onboarding_submission_uidx
  ON public.venues (organization_id, onboarding_submission_id)
  WHERE onboarding_submission_id IS NOT NULL;

DO $$
DECLARE
  index_is_canonical boolean;
BEGIN
  SELECT
    venue_request_index.indisunique
    AND venue_request_index.indisvalid
    AND venue_request_index.indisready
    AND NOT venue_request_index.indisprimary
    AND venue_request_index.indexprs IS NULL
    AND venue_request_index.indnkeyatts = 2
    AND venue_request_index.indnatts = 2
    AND venue_request_index.indkey[0] = organization_attribute.attnum
    AND venue_request_index.indkey[1] = request_attribute.attnum
    AND access_method.amname = 'btree'
    AND regexp_replace(
      lower(pg_get_expr(venue_request_index.indpred, venue_request_index.indrelid)),
      '[[:space:]()]',
      '',
      'g'
    ) = 'onboarding_submission_idisnotnull'
  INTO index_is_canonical
  FROM pg_class AS index_relation
  JOIN pg_namespace AS index_namespace
    ON index_namespace.oid = index_relation.relnamespace
  JOIN pg_am AS access_method
    ON access_method.oid = index_relation.relam
  JOIN pg_index AS venue_request_index
    ON venue_request_index.indexrelid = index_relation.oid
  JOIN pg_attribute AS organization_attribute
    ON organization_attribute.attrelid = venue_request_index.indrelid
   AND organization_attribute.attname = 'organization_id'
  JOIN pg_attribute AS request_attribute
    ON request_attribute.attrelid = venue_request_index.indrelid
   AND request_attribute.attname = 'onboarding_submission_id'
  WHERE index_namespace.nspname = 'public'
    AND index_relation.relname = 'venues_org_onboarding_submission_uidx'
    AND venue_request_index.indrelid = 'public.venues'::regclass;

  IF index_is_canonical IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0032 found a non-canonical venue onboarding-submission index',
      HINT = 'The canonical index is UNIQUE (organization_id, onboarding_submission_id) WHERE onboarding_submission_id IS NOT NULL.';
  END IF;
END $$;

-- Hall creation idempotency is venue-scoped. Existing rows are legacy and
-- legitimately keep both fields NULL; a half-populated identity is ambiguous.
DO $$
DECLARE
  invalid_count bigint;
BEGIN
  SELECT count(*)
  INTO invalid_count
  FROM public.venue_halls
  WHERE (creation_request_id IS NULL) <> (creation_payload_hash IS NULL);
  IF invalid_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('0032 cannot enforce hall creation-request shape; %s invalid rows exist', invalid_count),
      HINT = 'Repair each hall to have either both creation fields NULL or both populated.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.venue_halls'::regclass
      AND conname = 'venue_halls_creation_request_shape_chk'
  ) THEN
    ALTER TABLE public.venue_halls
      ADD CONSTRAINT venue_halls_creation_request_shape_chk
      CHECK ((creation_request_id IS NULL) = (creation_payload_hash IS NULL));
  END IF;
END $$;

DO $$
DECLARE
  creation_check text;
  check_is_validated boolean;
  check_is_inheritable boolean;
BEGIN
  SELECT regexp_replace(
    lower(pg_get_expr(conbin, conrelid)),
    '[[:space:]()]',
    '',
    'g'
  ), convalidated, NOT connoinherit
  INTO creation_check, check_is_validated, check_is_inheritable
  FROM pg_constraint
  WHERE conrelid = 'public.venue_halls'::regclass
    AND conname = 'venue_halls_creation_request_shape_chk'
    AND contype = 'c';

  IF check_is_validated IS DISTINCT FROM TRUE
    OR check_is_inheritable IS DISTINCT FROM TRUE
    OR creation_check IS DISTINCT FROM
      'creation_request_idisnull=creation_payload_hashisnull'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0032 found a non-canonical hall creation-request check',
      HINT = 'The canonical CHECK requires the creation request id/hash pair to be both NULL or both populated.';
  END IF;
END $$;

DO $$
DECLARE
  duplicate_summary text;
BEGIN
  SELECT string_agg(
    format('%s/%s (%s rows)', duplicate_key.venue_id, duplicate_key.creation_request_id, duplicate_key.row_count),
    ', '
    ORDER BY duplicate_key.venue_id, duplicate_key.creation_request_id
  )
  INTO duplicate_summary
  FROM (
    SELECT venue_id, creation_request_id, count(*) AS row_count
    FROM public.venue_halls
    WHERE creation_request_id IS NOT NULL
    GROUP BY venue_id, creation_request_id
    HAVING count(*) > 1
    LIMIT 10
  ) AS duplicate_key;

  IF duplicate_summary IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = '0032 cannot enforce hall creation idempotency; duplicates exist: ' || duplicate_summary,
      HINT = 'Resolve each venue/request key to one canonical hall, then re-run migration 0032.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS venue_halls_venue_creation_request_uidx
  ON public.venue_halls (venue_id, creation_request_id)
  WHERE creation_request_id IS NOT NULL;

DO $$
DECLARE
  index_is_canonical boolean;
BEGIN
  SELECT
    hall_request_index.indisunique
    AND hall_request_index.indisvalid
    AND hall_request_index.indisready
    AND NOT hall_request_index.indisprimary
    AND hall_request_index.indexprs IS NULL
    AND hall_request_index.indnkeyatts = 2
    AND hall_request_index.indnatts = 2
    AND hall_request_index.indkey[0] = venue_attribute.attnum
    AND hall_request_index.indkey[1] = request_attribute.attnum
    AND access_method.amname = 'btree'
    AND regexp_replace(
      lower(pg_get_expr(hall_request_index.indpred, hall_request_index.indrelid)),
      '[[:space:]()]',
      '',
      'g'
    ) = 'creation_request_idisnotnull'
  INTO index_is_canonical
  FROM pg_class AS index_relation
  JOIN pg_namespace AS index_namespace
    ON index_namespace.oid = index_relation.relnamespace
  JOIN pg_am AS access_method
    ON access_method.oid = index_relation.relam
  JOIN pg_index AS hall_request_index
    ON hall_request_index.indexrelid = index_relation.oid
  JOIN pg_attribute AS venue_attribute
    ON venue_attribute.attrelid = hall_request_index.indrelid
   AND venue_attribute.attname = 'venue_id'
  JOIN pg_attribute AS request_attribute
    ON request_attribute.attrelid = hall_request_index.indrelid
   AND request_attribute.attname = 'creation_request_id'
  WHERE index_namespace.nspname = 'public'
    AND index_relation.relname = 'venue_halls_venue_creation_request_uidx'
    AND hall_request_index.indrelid = 'public.venue_halls'::regclass;

  IF index_is_canonical IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0032 found a non-canonical hall creation-request index',
      HINT = 'The canonical index is UNIQUE (venue_id, creation_request_id) WHERE creation_request_id IS NOT NULL.';
  END IF;
END $$;

-- Repair gallery data before enforcing the invariant. Hall images are never
-- venue covers; among legacy general covers, keep the deterministic first by
-- sort_order then id (NULL sort orders are last).
UPDATE public.venue_images
SET is_cover = false
WHERE hall_id IS NOT NULL
  AND is_cover = true;

WITH ranked_general_covers AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY venue_id
      ORDER BY sort_order ASC NULLS LAST, id ASC
    ) AS cover_rank
  FROM public.venue_images
  WHERE hall_id IS NULL
    AND is_cover = true
)
UPDATE public.venue_images AS image
SET is_cover = false
FROM ranked_general_covers AS ranked
WHERE image.id = ranked.id
  AND ranked.cover_rank > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.venue_images'::regclass
      AND conname = 'venue_images_hall_cannot_be_cover_chk'
  ) THEN
    ALTER TABLE public.venue_images
      ADD CONSTRAINT venue_images_hall_cannot_be_cover_chk
      CHECK (hall_id IS NULL OR NOT is_cover);
  END IF;
END $$;

DO $$
DECLARE
  cover_check text;
  check_is_validated boolean;
  check_is_inheritable boolean;
BEGIN
  SELECT regexp_replace(
    lower(pg_get_expr(conbin, conrelid)),
    '[[:space:]()]',
    '',
    'g'
  ), convalidated, NOT connoinherit
  INTO cover_check, check_is_validated, check_is_inheritable
  FROM pg_constraint
  WHERE conrelid = 'public.venue_images'::regclass
    AND conname = 'venue_images_hall_cannot_be_cover_chk'
    AND contype = 'c';

  IF check_is_validated IS DISTINCT FROM TRUE
    OR check_is_inheritable IS DISTINCT FROM TRUE
    OR cover_check IS DISTINCT FROM 'hall_idisnullornotis_cover'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0032 found a non-canonical hall-image cover check',
      HINT = 'The canonical CHECK is hall_id IS NULL OR NOT is_cover.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS venue_images_one_general_cover_per_venue_uidx
  ON public.venue_images (venue_id)
  WHERE hall_id IS NULL AND is_cover;

DO $$
DECLARE
  index_is_canonical boolean;
BEGIN
  SELECT
    cover_index.indisunique
    AND cover_index.indisvalid
    AND cover_index.indisready
    AND NOT cover_index.indisprimary
    AND cover_index.indexprs IS NULL
    AND cover_index.indnkeyatts = 1
    AND cover_index.indnatts = 1
    AND cover_index.indkey[0] = venue_attribute.attnum
    AND access_method.amname = 'btree'
    AND regexp_replace(
      lower(pg_get_expr(cover_index.indpred, cover_index.indrelid)),
      '[[:space:]()]',
      '',
      'g'
    ) = 'hall_idisnullandis_cover'
  INTO index_is_canonical
  FROM pg_class AS index_relation
  JOIN pg_namespace AS index_namespace
    ON index_namespace.oid = index_relation.relnamespace
  JOIN pg_am AS access_method
    ON access_method.oid = index_relation.relam
  JOIN pg_index AS cover_index
    ON cover_index.indexrelid = index_relation.oid
  JOIN pg_attribute AS venue_attribute
    ON venue_attribute.attrelid = cover_index.indrelid
   AND venue_attribute.attname = 'venue_id'
  WHERE index_namespace.nspname = 'public'
    AND index_relation.relname = 'venue_images_one_general_cover_per_venue_uidx'
    AND cover_index.indrelid = 'public.venue_images'::regclass;

  IF index_is_canonical IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0032 found a non-canonical general venue-cover index',
      HINT = 'The canonical index is UNIQUE (venue_id) WHERE hall_id IS NULL AND is_cover.';
  END IF;
END $$;

-- `venues` and `venue_images` predate 0028, so they were not covered by that
-- migration's new-table REVOKE block. They now carry organization/hall
-- identities and idempotency material which must never be writable/readable
-- through Supabase's browser roles. The application uses its server database
-- connection and authenticated API routes for these records.
DO $$
DECLARE r text; s text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.venues FROM %I', r);
      EXECUTE format('REVOKE ALL ON TABLE public.venue_images FROM %I', r);
      FOR s IN
        SELECT sequence_name
        FROM information_schema.sequences
        WHERE sequence_schema = 'public'
          AND sequence_name = ANY (ARRAY['venues_id_seq','venue_images_id_seq'])
      LOOP
        EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM %I', s, r);
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- Organization contracts bind the legal holder once and are deliberately not
-- linked to an arbitrary Venue/artist profile. Refuse silent evidence repair:
-- any pre-existing mixed-scope row must be investigated before rollout.
DO $$
DECLARE invalid_count bigint;
BEGIN
  SELECT count(*)
  INTO invalid_count
  FROM public.legal_acceptances
  WHERE organization_id IS NOT NULL
    AND (artist_id IS NOT NULL OR venue_id IS NOT NULL);
  IF invalid_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = format('0032 cannot enforce organization legal scope; %s cross-scoped evidence rows exist', invalid_count),
      HINT = 'Audit the immutable evidence rows and resolve them through an explicit legal migration before retrying 0032.';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.legal_acceptances'::regclass
      AND conname = 'legal_acceptances_org_profile_scope_chk'
  ) THEN
    ALTER TABLE public.legal_acceptances
      ADD CONSTRAINT legal_acceptances_org_profile_scope_chk
      CHECK (organization_id IS NULL OR (artist_id IS NULL AND venue_id IS NULL));
  END IF;
END $$;

DO $$
DECLARE
  scope_check text;
  check_is_validated boolean;
  check_is_inheritable boolean;
BEGIN
  SELECT regexp_replace(
    lower(pg_get_expr(conbin, conrelid)),
    '[[:space:]()]',
    '',
    'g'
  ), convalidated, NOT connoinherit
  INTO scope_check, check_is_validated, check_is_inheritable
  FROM pg_constraint
  WHERE conrelid = 'public.legal_acceptances'::regclass
    AND conname = 'legal_acceptances_org_profile_scope_chk'
    AND contype = 'c';

  IF check_is_validated IS DISTINCT FROM TRUE
    OR check_is_inheritable IS DISTINCT FROM TRUE
    OR scope_check IS DISTINCT FROM
      'organization_idisnullorartist_idisnullandvenue_idisnull'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = '0032 found a non-canonical organization legal-profile scope check',
      HINT = 'The canonical CHECK keeps artist_id and venue_id NULL whenever organization_id is populated.';
  END IF;
END $$;

ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_images ENABLE ROW LEVEL SECURITY;

-- 0028 created inactive legacy-default halls as drafts. They represent an
-- already-submitted legacy venue, not a new editable hall, so expose them to
-- the corrected approval flow without touching their edit revision/timestamp.
-- Deliberately exclude organization-backed, active, rejected and non-default
-- rows; this is a one-way status-only compatibility bootstrap.
UPDATE public.venue_halls AS hall
SET status = 'pending'
FROM public.venues AS venue
WHERE hall.venue_id = venue.id
  AND hall.is_legacy_default = true
  AND hall.status = 'draft'
  AND venue.organization_id IS NULL
  AND venue.user_id IS NOT NULL
  AND venue.is_active = false;

COMMIT;
