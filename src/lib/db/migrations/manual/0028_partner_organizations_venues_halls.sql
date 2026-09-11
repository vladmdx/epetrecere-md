-- 0028 — Partner organizations → venues (locations) → halls  (ADR 0028)
--
-- EXPAND phase only. Everything here is additive and idempotent:
--   * new enums are created only if missing;
--   * new tables use CREATE TABLE IF NOT EXISTS;
--   * new columns use ADD COLUMN IF NOT EXISTS;
--   * new indexes/constraints are guarded;
--   * the backfill is written so a second run creates no duplicates.
--
-- It does NOT drop venues.user_id or its UNIQUE constraint, does not change any
-- public/booking behaviour, and does not touch historical amounts, statuses,
-- signatures or hashes. The multi-hall behaviour is gated by the MULTI_HALL
-- feature flag in application code; this migration only makes the model exist.
--
-- Canonical mechanism per src/lib/db/migrations/README.md: hand-written
-- idempotent SQL, applied via scripts/apply-sql-file.ts or psql. Do NOT run
-- drizzle-kit generate. Keep src/lib/db/schema.ts in sync (done alongside).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. ENUMS
-- ─────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'partner_org_type') THEN
    CREATE TYPE partner_org_type AS ENUM ('individual', 'sole_trader', 'company');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'partner_entity_status') THEN
    CREATE TYPE partner_entity_status AS ENUM
      ('draft', 'pending', 'active', 'rejected', 'suspended', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_member_role') THEN
    CREATE TYPE org_member_role AS ENUM ('owner', 'admin', 'manager', 'staff');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hall_pricing_model') THEN
    CREATE TYPE hall_pricing_model AS ENUM
      ('per_person', 'minimum_order', 'fixed', 'quote');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hall_deposit_type') THEN
    CREATE TYPE hall_deposit_type AS ENUM ('none', 'percent', 'fixed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hall_seating_type') THEN
    CREATE TYPE hall_seating_type AS ENUM
      ('banquet', 'theatre', 'classroom', 'cocktail', 'u_shape', 'custom');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reservation_scope') THEN
    CREATE TYPE reservation_scope AS ENUM ('hall', 'venue');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'schedule_block_kind') THEN
    CREATE TYPE schedule_block_kind AS ENUM
      ('maintenance', 'sanitary_day', 'private_event', 'manual', 'external_calendar');
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. PARTNER ORGANIZATIONS + MEMBERSHIPS
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partner_organizations (
  id             serial PRIMARY KEY,
  type           partner_org_type NOT NULL DEFAULT 'company',
  display_name   text NOT NULL,
  legal_name     text,
  id_number      text,
  legal_address  text,
  billing_email  text,
  billing_phone  text,
  -- Bank details kept server-side only; never exposed in catalog/logs.
  bank_details   jsonb,
  status         partner_entity_status NOT NULL DEFAULT 'active',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_organization_members (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES partner_organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            org_member_role NOT NULL DEFAULT 'owner',
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_org_members_org_user_unique
  ON partner_organization_members (organization_id, user_id);
CREATE INDEX IF NOT EXISTS partner_org_members_user_idx
  ON partner_organization_members (user_id);
CREATE INDEX IF NOT EXISTS partner_org_members_org_idx
  ON partner_organization_members (organization_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. VENUES BECOME LOCATIONS — add organization_id (keep user_id for now)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS organization_id integer REFERENCES partner_organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS venues_organization_idx ON venues (organization_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. VENUE HALLS
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venue_halls (
  id                serial PRIMARY KEY,
  venue_id          integer NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  slug              text NOT NULL,
  name_ro           text NOT NULL,
  name_ru           text,
  name_en           text,
  description_ro    text,
  description_ru    text,
  description_en    text,
  capacity_min      integer,
  capacity_max      integer,
  pricing_model     hall_pricing_model NOT NULL DEFAULT 'per_person',
  base_price        numeric(12,2),
  minimum_order     numeric(12,2),
  currency          varchar(3) NOT NULL DEFAULT 'EUR',
  deposit_type      hall_deposit_type NOT NULL DEFAULT 'none',
  deposit_value     numeric(12,2),
  facilities        jsonb DEFAULT '[]'::jsonb,
  -- NULL working_hours / buffer_minutes = inherit from the venue.
  working_hours     jsonb,
  buffer_minutes    integer,
  booking_terms_ro  text,
  booking_terms_ru  text,
  booking_terms_en  text,
  is_legacy_default boolean NOT NULL DEFAULT false,
  status            partner_entity_status NOT NULL DEFAULT 'draft',
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_halls_capacity_chk
    CHECK (capacity_min IS NULL OR capacity_max IS NULL OR capacity_max >= capacity_min),
  CONSTRAINT venue_halls_capacity_positive_chk
    CHECK ((capacity_min IS NULL OR capacity_min >= 0)
       AND (capacity_max IS NULL OR capacity_max >= 0))
);

-- slug unique within a venue
CREATE UNIQUE INDEX IF NOT EXISTS venue_halls_venue_slug_unique
  ON venue_halls (venue_id, slug);
-- composite unique needed so child tables can FK (hall_id, venue_id) and the
-- database itself refuses to attach venue B's hall to venue A.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'venue_halls_id_venue_unique'
  ) THEN
    ALTER TABLE venue_halls
      ADD CONSTRAINT venue_halls_id_venue_unique UNIQUE (id, venue_id);
  END IF;
END $$;
-- at most one legacy-default hall per venue
CREATE UNIQUE INDEX IF NOT EXISTS venue_halls_one_legacy_default_per_venue
  ON venue_halls (venue_id) WHERE is_legacy_default;
CREATE INDEX IF NOT EXISTS venue_halls_venue_status_sort_idx
  ON venue_halls (venue_id, status, sort_order);
CREATE INDEX IF NOT EXISTS venue_halls_capacity_idx
  ON venue_halls (venue_id, capacity_min, capacity_max);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. SEATING OPTIONS
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venue_hall_seating_options (
  id           serial PRIMARY KEY,
  hall_id      integer NOT NULL REFERENCES venue_halls(id) ON DELETE CASCADE,
  type         hall_seating_type NOT NULL,
  label_ro     text,
  label_ru     text,
  label_en     text,
  capacity_min integer,
  capacity_max integer,
  notes_ro     text,
  notes_ru     text,
  notes_en     text,
  sort_order   integer NOT NULL DEFAULT 0,
  CONSTRAINT hall_seating_capacity_chk
    CHECK (capacity_min IS NULL OR capacity_max IS NULL OR capacity_max >= capacity_min)
);
CREATE INDEX IF NOT EXISTS hall_seating_hall_idx
  ON venue_hall_seating_options (hall_id, sort_order);

-- ─────────────────────────────────────────────────────────────────────────
-- 6. MENU SETS (location-level) + hall assignments
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venue_menu_sets (
  id          serial PRIMARY KEY,
  venue_id    integer NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name_ro     text NOT NULL,
  name_ru     text,
  name_en     text,
  is_default  boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS venue_menu_sets_one_default_per_venue
  ON venue_menu_sets (venue_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS venue_menu_sets_venue_idx ON venue_menu_sets (venue_id);

CREATE TABLE IF NOT EXISTS venue_hall_menu_sets (
  hall_id     integer NOT NULL REFERENCES venue_halls(id) ON DELETE CASCADE,
  menu_set_id integer NOT NULL REFERENCES venue_menu_sets(id) ON DELETE CASCADE,
  PRIMARY KEY (hall_id, menu_set_id)
);

-- Scope the existing menu tables and scan cache to a set (nullable during the
-- transition; NULL keeps the current location-wide behaviour).
ALTER TABLE venue_menu_categories
  ADD COLUMN IF NOT EXISTS menu_set_id integer REFERENCES venue_menu_sets(id) ON DELETE SET NULL;
ALTER TABLE venue_menu_packages
  ADD COLUMN IF NOT EXISTS menu_set_id integer REFERENCES venue_menu_sets(id) ON DELETE SET NULL;
ALTER TABLE menu_scan_cache
  ADD COLUMN IF NOT EXISTS menu_set_id integer REFERENCES venue_menu_sets(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. VENUE IMAGES — optional hall scope with composite integrity
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE venue_images
  ADD COLUMN IF NOT EXISTS hall_id integer;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'venue_images_hall_venue_fk'
  ) THEN
    ALTER TABLE venue_images
      ADD CONSTRAINT venue_images_hall_venue_fk
      FOREIGN KEY (hall_id, venue_id) REFERENCES venue_halls(id, venue_id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS venue_images_hall_idx ON venue_images (hall_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 8. SCHEDULE BLOCKS (non-booking) + CONFLICT GROUPS
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venue_schedule_blocks (
  id         serial PRIMARY KEY,
  venue_id   integer NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  hall_id    integer,
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,
  kind       schedule_block_kind NOT NULL DEFAULT 'manual',
  reason     text,
  source     text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_schedule_blocks_interval_chk CHECK (ends_at > starts_at)
);
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'venue_schedule_blocks_hall_venue_fk'
  ) THEN
    ALTER TABLE venue_schedule_blocks
      ADD CONSTRAINT venue_schedule_blocks_hall_venue_fk
      FOREIGN KEY (hall_id, venue_id) REFERENCES venue_halls(id, venue_id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS venue_schedule_blocks_venue_time_idx
  ON venue_schedule_blocks (venue_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS venue_schedule_blocks_hall_time_idx
  ON venue_schedule_blocks (hall_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS venue_hall_conflict_groups (
  id        serial PRIMARY KEY,
  venue_id  integer NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_hall_conflict_groups_venue_idx
  ON venue_hall_conflict_groups (venue_id);

CREATE TABLE IF NOT EXISTS venue_hall_conflict_group_members (
  group_id integer NOT NULL REFERENCES venue_hall_conflict_groups(id) ON DELETE CASCADE,
  hall_id  integer NOT NULL REFERENCES venue_halls(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, hall_id)
);

-- ─────────────────────────────────────────────────────────────────────────
-- 9. BOOKING REQUESTS — hall + canonical interval + commercial snapshot
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS hall_id integer,
  ADD COLUMN IF NOT EXISTS reservation_scope reservation_scope,
  ADD COLUMN IF NOT EXISTS starts_at timestamptz,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS agreed_currency varchar(3),
  ADD COLUMN IF NOT EXISTS commercial_snapshot jsonb;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'booking_requests_hall_venue_fk'
  ) THEN
    -- ON DELETE SET NULL on the pair keeps historical bookings when a hall is
    -- removed; business rule prefers archiving halls that have bookings.
    ALTER TABLE booking_requests
      ADD CONSTRAINT booking_requests_hall_venue_fk
      FOREIGN KEY (hall_id, venue_id) REFERENCES venue_halls(id, venue_id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS booking_requests_hall_idx ON booking_requests (hall_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 10. LEGAL ACCEPTANCES — organization link + append-only trigger extension
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE legal_acceptances
  ADD COLUMN IF NOT EXISTS organization_id integer REFERENCES partner_organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS legal_acceptances_organization_idx
  ON legal_acceptances (organization_id);
-- New organization acceptances key on (organization_id, document_slug,
-- document_version). Partial so legacy user-based rows are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS legal_acceptances_org_unique
  ON legal_acceptances (organization_id, document_slug, document_version)
  WHERE organization_id IS NOT NULL;

-- Extend the append-only guard from 0017 so organization_id may be set exactly
-- once (NULL → id) or cleared by ON DELETE SET NULL, never swapped — identical
-- to the artist_id/venue_id rule. Evidence (signature/hash/text) stays frozen.
CREATE OR REPLACE FUNCTION public.legal_acceptances_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'legal_acceptances is append-only: a signature cannot be deleted (id=%)',
      OLD.id USING ERRCODE = '42501';
  END IF;

  -- Everything that is not a linkage column must be byte-identical.
  IF (to_jsonb(NEW) - 'user_id' - 'artist_id' - 'venue_id' - 'organization_id')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'user_id' - 'artist_id' - 'venue_id' - 'organization_id') THEN
    RAISE EXCEPTION
      'legal_acceptances is append-only: the signature record cannot be modified (id=%)',
      OLD.id USING ERRCODE = '42501';
  END IF;

  -- user_id may only be cleared, never assigned.
  IF NEW.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION
      'legal_acceptances is append-only: a signature cannot be re-assigned to another account (id=%)',
      OLD.id USING ERRCODE = '42501';
  END IF;

  -- artist_id / venue_id / organization_id may be set once (NULL → id) or
  -- cleared by the foreign key, never swapped for a different id.
  IF (OLD.artist_id IS NOT NULL AND NEW.artist_id IS NOT NULL
      AND NEW.artist_id <> OLD.artist_id)
     OR (OLD.venue_id IS NOT NULL AND NEW.venue_id IS NOT NULL
      AND NEW.venue_id <> OLD.venue_id)
     OR (OLD.organization_id IS NOT NULL AND NEW.organization_id IS NOT NULL
      AND NEW.organization_id <> OLD.organization_id) THEN
    RAISE EXCEPTION
      'legal_acceptances is append-only: a signature cannot be moved to another profile (id=%)',
      OLD.id USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS legal_acceptances_append_only ON public.legal_acceptances;
CREATE TRIGGER legal_acceptances_append_only
  BEFORE UPDATE OR DELETE ON public.legal_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.legal_acceptances_append_only();

-- ─────────────────────────────────────────────────────────────────────────
-- 11. COMMISSIONS + REVIEWS — hall context (financial evidence unchanged)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS hall_id integer REFERENCES venue_halls(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hall_name_snapshot text;
CREATE INDEX IF NOT EXISTS commissions_hall_idx ON commissions (hall_id);

ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS hall_id integer REFERENCES venue_halls(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS reviews_hall_idx ON reviews (hall_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 12. BACKFILL (idempotent)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v RECORD;
  new_org_id integer;
  default_hall_id integer;
BEGIN
  -- 12a. One organization + owner membership per existing venue owner.
  --      Current UNIQUE(venues.user_id) means one venue per owner, but we key
  --      on the user so re-runs and future multi-venue owners are safe.
  FOR v IN
    SELECT DISTINCT vn.user_id
    FROM venues vn
    WHERE vn.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM partner_organization_members m WHERE m.user_id = vn.user_id
      )
  LOOP
    INSERT INTO partner_organizations (type, display_name, legal_name, id_number,
                                       legal_address, billing_email, status)
    SELECT
      COALESCE(NULLIF(la.partner_type, '')::partner_org_type, 'company'),
      COALESCE(NULLIF(la.legal_name, ''), vn.name_ro, 'Organizație'),
      NULLIF(la.legal_name, ''),
      NULLIF(la.id_number, ''),
      NULLIF(la.legal_address, ''),
      vn.email,
      'active'
    FROM venues vn
    LEFT JOIN LATERAL (
      SELECT partner_type, legal_name, id_number, legal_address
      FROM legal_acceptances la2
      WHERE la2.user_id = v.user_id AND la2.subject_type = 'venue'
      ORDER BY la2.accepted_at DESC
      LIMIT 1
    ) la ON true
    WHERE vn.user_id = v.user_id
    ORDER BY vn.id
    LIMIT 1
    RETURNING id INTO new_org_id;

    INSERT INTO partner_organization_members (organization_id, user_id, role, is_active)
    VALUES (new_org_id, v.user_id, 'owner', true)
    ON CONFLICT (organization_id, user_id) DO NOTHING;

    -- 12b. Link this owner's venues to the organization.
    UPDATE venues SET organization_id = new_org_id, updated_at = now()
    WHERE user_id = v.user_id AND organization_id IS NULL;
  END LOOP;

  -- 12c. One legacy-default hall per venue that has none, carrying legacy
  --      capacity/price/facilities/working_hours/buffer.
  FOR v IN
    SELECT vn.* FROM venues vn
    WHERE NOT EXISTS (
      SELECT 1 FROM venue_halls h WHERE h.venue_id = vn.id AND h.is_legacy_default
    )
  LOOP
    INSERT INTO venue_halls (
      venue_id, slug, name_ro, name_ru, name_en,
      capacity_min, capacity_max, pricing_model, base_price, currency,
      facilities, working_hours, buffer_minutes,
      is_legacy_default, status, sort_order
    )
    VALUES (
      v.id, 'principal', COALESCE(v.name_ro, 'Sala principală'), v.name_ru, v.name_en,
      v.capacity_min, v.capacity_max,
      'per_person', v.price_per_person::numeric, 'EUR',
      COALESCE(v.facilities, '[]'::jsonb), v.working_hours, v.buffer_minutes,
      true,
      CASE WHEN v.is_active THEN 'active'::partner_entity_status ELSE 'draft'::partner_entity_status END,
      0
    )
    ON CONFLICT (venue_id, slug) DO NOTHING
    RETURNING id INTO default_hall_id;

    -- Resolve the default hall id whether just inserted or pre-existing.
    IF default_hall_id IS NULL THEN
      SELECT id INTO default_hall_id FROM venue_halls
      WHERE venue_id = v.id AND is_legacy_default LIMIT 1;
    END IF;

    -- 12d. Default menu set for the venue + attach the legacy default hall.
    IF NOT EXISTS (SELECT 1 FROM venue_menu_sets s WHERE s.venue_id = v.id AND s.is_default) THEN
      INSERT INTO venue_menu_sets (venue_id, name_ro, is_default, sort_order)
      VALUES (v.id, 'Meniu principal', true, 0);
    END IF;
    INSERT INTO venue_hall_menu_sets (hall_id, menu_set_id)
    SELECT default_hall_id, s.id FROM venue_menu_sets s
    WHERE s.venue_id = v.id AND s.is_default
    ON CONFLICT DO NOTHING;

    -- 12e. Point existing venue bookings without a hall at the default hall.
    UPDATE booking_requests
    SET hall_id = default_hall_id,
        reservation_scope = COALESCE(reservation_scope, 'hall')
    WHERE venue_id = v.id AND hall_id IS NULL;

    -- 12f. Commission hall context for this venue's commissions.
    UPDATE commissions c
    SET hall_id = default_hall_id
    WHERE c.venue_id = v.id AND c.hall_id IS NULL;

    default_hall_id := NULL;
  END LOOP;

  -- 12g. Link existing venue legal acceptances to the venue's organization.
  --      NULL → id only; the append-only trigger permits exactly this.
  UPDATE legal_acceptances la
  SET organization_id = vn.organization_id
  FROM venues vn
  WHERE la.subject_type = 'venue'
    AND la.venue_id = vn.id
    AND la.organization_id IS NULL
    AND vn.organization_id IS NOT NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 13. POST-MIGRATION INVARIANTS (fail loudly on true violations)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  bad integer;
BEGIN
  -- Every venue that has an owner must now have an organization.
  SELECT count(*) INTO bad FROM venues
  WHERE user_id IS NOT NULL AND organization_id IS NULL;
  IF bad > 0 THEN
    RAISE EXCEPTION 'backfill invariant failed: % owned venues without organization', bad;
  END IF;

  -- Exactly one legacy-default hall per venue (0 or 1 enforced by index; assert 1).
  SELECT count(*) INTO bad FROM venues vn
  WHERE NOT EXISTS (SELECT 1 FROM venue_halls h WHERE h.venue_id = vn.id AND h.is_legacy_default);
  IF bad > 0 THEN
    RAISE EXCEPTION 'backfill invariant failed: % venues without a default hall', bad;
  END IF;

  -- No orphan membership (defensive; FKs already guarantee this).
  SELECT count(*) INTO bad FROM partner_organization_members m
  WHERE NOT EXISTS (SELECT 1 FROM partner_organizations o WHERE o.id = m.organization_id)
     OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = m.user_id);
  IF bad > 0 THEN
    RAISE EXCEPTION 'backfill invariant failed: % orphan memberships', bad;
  END IF;

  -- Every venue booking now names a hall.
  SELECT count(*) INTO bad FROM booking_requests
  WHERE venue_id IS NOT NULL AND hall_id IS NULL;
  IF bad > 0 THEN
    RAISE EXCEPTION 'backfill invariant failed: % venue bookings without a hall', bad;
  END IF;

  RAISE NOTICE '0028 backfill invariants OK';
END $$;

COMMIT;
