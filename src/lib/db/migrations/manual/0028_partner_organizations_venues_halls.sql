-- 0028 — Partner organizations → venues (locations) → halls  (ADR 0028)
--
-- EXPAND phase only. Additive + idempotent + self-healing (safe to run on a
-- database that already had an earlier revision of this file applied): it
-- drops and recreates the constraints it manages by name/column so re-runs and
-- upgrades converge to the same corrected shape.
--
-- It does NOT drop venues.user_id or its UNIQUE constraint, does not change any
-- public/booking behaviour, and does not touch historical amounts, statuses,
-- signatures or hashes. Multi-hall behaviour is gated by the MULTI_HALL feature
-- flag in application code; this migration only makes the model exist.
--
-- Canonical mechanism per src/lib/db/migrations/README.md: hand-written
-- idempotent SQL applied via scripts/apply-sql-file.ts or psql. Do NOT run
-- drizzle-kit generate. Keep src/lib/db/schema.ts in sync (done alongside).
--
-- Correction notes (ADR 0028 review):
--   #4 composite (hall_id, venue_id) FKs use ON DELETE SET NULL (hall_id) so a
--      hall deletion never nulls venue_id (falls back to RESTRICT on PG < 15).
--   #5 the legacy legal_acceptances_unique index is scoped to organization_id
--      IS NULL so one user can sign the same version for two organizations.
--   #6 commissions FKs never cascade financial evidence away (booking → RESTRICT,
--      venue/artist → SET NULL) and carry name snapshots.
--   #7 same-venue integrity via composite FKs on menu sets/rows, conflict-group
--      members, commissions and reviews.
--   #8 backfill also covers legacy menus, timezone, canonical intervals, legacy
--      calendar blocks, commercial + name snapshots, and flags owner-less venues.
--   #9 REVOKE anon/authenticated on the new server-only tables and sequences.

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
    CREATE TYPE hall_pricing_model AS ENUM ('per_person', 'minimum_order', 'fixed', 'quote');
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
  bank_details   jsonb,   -- server-side only; never exposed publicly (see REVOKE below)
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
  working_hours     jsonb,           -- NULL = inherit from venue
  buffer_minutes    integer,         -- NULL = inherit from venue
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
CREATE UNIQUE INDEX IF NOT EXISTS venue_halls_venue_slug_unique
  ON venue_halls (venue_id, slug);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_halls_id_venue_unique') THEN
    ALTER TABLE venue_halls ADD CONSTRAINT venue_halls_id_venue_unique UNIQUE (id, venue_id);
  END IF;
END $$;
-- Exactly one legacy-default hall per venue (0 or 1 at the DB level).
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
  label_ro     text, label_ru text, label_en text,
  capacity_min integer, capacity_max integer,
  notes_ro     text, notes_ru text, notes_en text,
  sort_order   integer NOT NULL DEFAULT 0,
  CONSTRAINT hall_seating_capacity_chk
    CHECK (capacity_min IS NULL OR capacity_max IS NULL OR capacity_max >= capacity_min)
);
CREATE INDEX IF NOT EXISTS hall_seating_hall_idx
  ON venue_hall_seating_options (hall_id, sort_order);

-- ─────────────────────────────────────────────────────────────────────────
-- 6. MENU SETS (location-level) + hall assignments (same-venue integrity)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS venue_menu_sets (
  id          serial PRIMARY KEY,
  venue_id    integer NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name_ro     text NOT NULL, name_ru text, name_en text,
  is_default  boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS venue_menu_sets_one_default_per_venue
  ON venue_menu_sets (venue_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS venue_menu_sets_venue_idx ON venue_menu_sets (venue_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_menu_sets_id_venue_unique') THEN
    ALTER TABLE venue_menu_sets ADD CONSTRAINT venue_menu_sets_id_venue_unique UNIQUE (id, venue_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS venue_hall_menu_sets (
  hall_id     integer NOT NULL,
  menu_set_id integer NOT NULL,
  venue_id    integer,   -- backfilled below; then made NOT NULL
  PRIMARY KEY (hall_id, menu_set_id)
);
ALTER TABLE venue_hall_menu_sets ADD COLUMN IF NOT EXISTS venue_id integer;
-- Backfill venue_id from the hall, then enforce same-venue composite FKs.
UPDATE venue_hall_menu_sets m
  SET venue_id = h.venue_id
  FROM venue_halls h WHERE h.id = m.hall_id AND m.venue_id IS NULL;
DO $$ BEGIN
  -- Drop any prior single-column FKs (from an earlier revision) by column lookup.
  PERFORM 1;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_hall_menu_sets_hall_id_venue_halls_id_fk') THEN
    ALTER TABLE venue_hall_menu_sets DROP CONSTRAINT venue_hall_menu_sets_hall_id_venue_halls_id_fk;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_hall_menu_sets_menu_set_id_venue_menu_sets_id_fk') THEN
    ALTER TABLE venue_hall_menu_sets DROP CONSTRAINT venue_hall_menu_sets_menu_set_id_venue_menu_sets_id_fk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_hall_menu_sets_hall_venue_fk') THEN
    ALTER TABLE venue_hall_menu_sets ADD CONSTRAINT venue_hall_menu_sets_hall_venue_fk
      FOREIGN KEY (hall_id, venue_id) REFERENCES venue_halls(id, venue_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_hall_menu_sets_set_venue_fk') THEN
    ALTER TABLE venue_hall_menu_sets ADD CONSTRAINT venue_hall_menu_sets_set_venue_fk
      FOREIGN KEY (menu_set_id, venue_id) REFERENCES venue_menu_sets(id, venue_id) ON DELETE CASCADE;
  END IF;
END $$;

-- Scope the existing menu tables + scan cache to a set. NULL keeps the current
-- location-wide behaviour; when set, a same-venue composite FK is enforced.
ALTER TABLE venue_menu_categories ADD COLUMN IF NOT EXISTS menu_set_id integer;
ALTER TABLE venue_menu_packages   ADD COLUMN IF NOT EXISTS menu_set_id integer;
ALTER TABLE menu_scan_cache       ADD COLUMN IF NOT EXISTS menu_set_id integer;
DO $$
DECLARE v int := current_setting('server_version_num')::int;
  t text;
  fk text;
BEGIN
  FOREACH t IN ARRAY ARRAY['venue_menu_categories','venue_menu_packages','menu_scan_cache'] LOOP
    -- Drop any pre-existing single-column menu_set_id FK (auto-named).
    SELECT con.conname INTO fk
      FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid
      JOIN pg_attribute att ON att.attrelid=rel.oid AND att.attnum=con.conkey[1]
      WHERE rel.relname=t AND con.contype='f' AND array_length(con.conkey,1)=1
        AND att.attname='menu_set_id';
    IF fk IS NOT NULL THEN EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', t, fk); END IF;
    -- Same-venue composite FK. SET NULL(menu_set_id) on PG15+, else RESTRICT.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t||'_menuset_venue_fk') THEN
      IF v >= 150000 THEN
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (menu_set_id, venue_id) REFERENCES venue_menu_sets(id, venue_id) ON DELETE SET NULL (menu_set_id)', t, t||'_menuset_venue_fk');
      ELSE
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (menu_set_id, venue_id) REFERENCES venue_menu_sets(id, venue_id) ON DELETE RESTRICT', t, t||'_menuset_venue_fk');
      END IF;
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. VENUE IMAGES — optional hall scope; SET NULL(hall_id) keeps venue_id
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE venue_images ADD COLUMN IF NOT EXISTS hall_id integer;
DO $$
DECLARE v int := current_setting('server_version_num')::int;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_images_hall_venue_fk') THEN
    ALTER TABLE venue_images DROP CONSTRAINT venue_images_hall_venue_fk;
  END IF;
  IF v >= 150000 THEN
    ALTER TABLE venue_images ADD CONSTRAINT venue_images_hall_venue_fk
      FOREIGN KEY (hall_id, venue_id) REFERENCES venue_halls(id, venue_id) ON DELETE SET NULL (hall_id);
  ELSE
    ALTER TABLE venue_images ADD CONSTRAINT venue_images_hall_venue_fk
      FOREIGN KEY (hall_id, venue_id) REFERENCES venue_halls(id, venue_id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS venue_images_hall_idx ON venue_images (hall_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 8. SCHEDULE BLOCKS + CONFLICT GROUPS (same-venue integrity)
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
DO $$
DECLARE v int := current_setting('server_version_num')::int;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_schedule_blocks_hall_venue_fk') THEN
    ALTER TABLE venue_schedule_blocks DROP CONSTRAINT venue_schedule_blocks_hall_venue_fk;
  END IF;
  IF v >= 150000 THEN
    ALTER TABLE venue_schedule_blocks ADD CONSTRAINT venue_schedule_blocks_hall_venue_fk
      FOREIGN KEY (hall_id, venue_id) REFERENCES venue_halls(id, venue_id) ON DELETE SET NULL (hall_id);
  ELSE
    ALTER TABLE venue_schedule_blocks ADD CONSTRAINT venue_schedule_blocks_hall_venue_fk
      FOREIGN KEY (hall_id, venue_id) REFERENCES venue_halls(id, venue_id) ON DELETE RESTRICT;
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
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_hall_conflict_groups_id_venue_unique') THEN
    ALTER TABLE venue_hall_conflict_groups ADD CONSTRAINT venue_hall_conflict_groups_id_venue_unique UNIQUE (id, venue_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS venue_hall_conflict_group_members (
  group_id integer NOT NULL,
  hall_id  integer NOT NULL,
  venue_id integer,
  PRIMARY KEY (group_id, hall_id)
);
ALTER TABLE venue_hall_conflict_group_members ADD COLUMN IF NOT EXISTS venue_id integer;
UPDATE venue_hall_conflict_group_members m
  SET venue_id = h.venue_id FROM venue_halls h WHERE h.id = m.hall_id AND m.venue_id IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_hall_conflict_group_members_group_id_venue_hall_conflict_groups_id_fk') THEN
    ALTER TABLE venue_hall_conflict_group_members DROP CONSTRAINT venue_hall_conflict_group_members_group_id_venue_hall_conflict_groups_id_fk;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'venue_hall_conflict_group_members_hall_id_venue_halls_id_fk') THEN
    ALTER TABLE venue_hall_conflict_group_members DROP CONSTRAINT venue_hall_conflict_group_members_hall_id_venue_halls_id_fk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conflict_members_group_venue_fk') THEN
    ALTER TABLE venue_hall_conflict_group_members ADD CONSTRAINT conflict_members_group_venue_fk
      FOREIGN KEY (group_id, venue_id) REFERENCES venue_hall_conflict_groups(id, venue_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conflict_members_hall_venue_fk') THEN
    ALTER TABLE venue_hall_conflict_group_members ADD CONSTRAINT conflict_members_hall_venue_fk
      FOREIGN KEY (hall_id, venue_id) REFERENCES venue_halls(id, venue_id) ON DELETE CASCADE;
  END IF;
END $$;

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
DO $$
DECLARE v int := current_setting('server_version_num')::int;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_requests_hall_venue_fk') THEN
    ALTER TABLE booking_requests DROP CONSTRAINT booking_requests_hall_venue_fk;
  END IF;
  IF v >= 150000 THEN
    ALTER TABLE booking_requests ADD CONSTRAINT booking_requests_hall_venue_fk
      FOREIGN KEY (hall_id, venue_id) REFERENCES venue_halls(id, venue_id) ON DELETE SET NULL (hall_id);
  ELSE
    ALTER TABLE booking_requests ADD CONSTRAINT booking_requests_hall_venue_fk
      FOREIGN KEY (hall_id, venue_id) REFERENCES venue_halls(id, venue_id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS booking_requests_hall_idx ON booking_requests (hall_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 10. LEGAL ACCEPTANCES — organization link + unique-index scoping + trigger
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE legal_acceptances
  ADD COLUMN IF NOT EXISTS organization_id integer REFERENCES partner_organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS legal_acceptances_organization_idx
  ON legal_acceptances (organization_id);

-- #5 — the legacy (user_id, subject_type, slug, version) unique must apply only
-- to legacy/artist/venue rows, so the same representative can sign the same
-- version for two DISTINCT organizations. Organization acceptances get their
-- own partial unique on (organization_id, slug, version).
DROP INDEX IF EXISTS legal_acceptances_unique;
CREATE UNIQUE INDEX IF NOT EXISTS legal_acceptances_unique
  ON legal_acceptances (user_id, subject_type, document_slug, document_version)
  WHERE organization_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS legal_acceptances_org_unique
  ON legal_acceptances (organization_id, document_slug, document_version)
  WHERE organization_id IS NOT NULL;

-- Extend the append-only guard from 0017 so organization_id may be set exactly
-- once (NULL → id) or cleared by ON DELETE SET NULL, never swapped.
CREATE OR REPLACE FUNCTION public.legal_acceptances_append_only()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'legal_acceptances is append-only: a signature cannot be deleted (id=%)', OLD.id USING ERRCODE = '42501';
  END IF;
  IF (to_jsonb(NEW) - 'user_id' - 'artist_id' - 'venue_id' - 'organization_id')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'user_id' - 'artist_id' - 'venue_id' - 'organization_id') THEN
    RAISE EXCEPTION 'legal_acceptances is append-only: the signature record cannot be modified (id=%)', OLD.id USING ERRCODE = '42501';
  END IF;
  IF NEW.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'legal_acceptances is append-only: a signature cannot be re-assigned to another account (id=%)', OLD.id USING ERRCODE = '42501';
  END IF;
  IF (OLD.artist_id IS NOT NULL AND NEW.artist_id IS NOT NULL AND NEW.artist_id <> OLD.artist_id)
     OR (OLD.venue_id IS NOT NULL AND NEW.venue_id IS NOT NULL AND NEW.venue_id <> OLD.venue_id)
     OR (OLD.organization_id IS NOT NULL AND NEW.organization_id IS NOT NULL AND NEW.organization_id <> OLD.organization_id) THEN
    RAISE EXCEPTION 'legal_acceptances is append-only: a signature cannot be moved to another profile (id=%)', OLD.id USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS legal_acceptances_append_only ON public.legal_acceptances;
CREATE TRIGGER legal_acceptances_append_only
  BEFORE UPDATE OR DELETE ON public.legal_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.legal_acceptances_append_only();

-- ─────────────────────────────────────────────────────────────────────────
-- 11. COMMISSIONS + REVIEWS — hall context + NO financial cascade (#6, #7)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS hall_id integer,
  ADD COLUMN IF NOT EXISTS hall_name_snapshot text,
  ADD COLUMN IF NOT EXISTS venue_name_snapshot text;
CREATE INDEX IF NOT EXISTS commissions_hall_idx ON commissions (hall_id);

DO $$
DECLARE v int := current_setting('server_version_num')::int; fk text;
BEGIN
  -- #6a booking_request_id: CASCADE → RESTRICT (deleting a booking must not
  -- erase its commission; archive the booking instead).
  SELECT con.conname INTO fk FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid
    JOIN pg_attribute att ON att.attrelid=rel.oid AND att.attnum=con.conkey[1]
    WHERE rel.relname='commissions' AND con.contype='f' AND array_length(con.conkey,1)=1 AND att.attname='booking_request_id';
  IF fk IS NOT NULL THEN EXECUTE format('ALTER TABLE commissions DROP CONSTRAINT %I', fk); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='commissions_booking_request_fk') THEN
    ALTER TABLE commissions ADD CONSTRAINT commissions_booking_request_fk
      FOREIGN KEY (booking_request_id) REFERENCES booking_requests(id) ON DELETE RESTRICT;
  END IF;

  -- #6b venue_id: CASCADE → SET NULL (keep the commission, snapshot the name).
  SELECT con.conname INTO fk FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid
    JOIN pg_attribute att ON att.attrelid=rel.oid AND att.attnum=con.conkey[1]
    WHERE rel.relname='commissions' AND con.contype='f' AND array_length(con.conkey,1)=1 AND att.attname='venue_id';
  IF fk IS NOT NULL THEN EXECUTE format('ALTER TABLE commissions DROP CONSTRAINT %I', fk); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='commissions_venue_fk') THEN
    ALTER TABLE commissions ADD CONSTRAINT commissions_venue_fk
      FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE SET NULL;
  END IF;

  -- #6c artist_id: CASCADE → SET NULL (symmetry; keep artist commissions).
  SELECT con.conname INTO fk FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid
    JOIN pg_attribute att ON att.attrelid=rel.oid AND att.attnum=con.conkey[1]
    WHERE rel.relname='commissions' AND con.contype='f' AND array_length(con.conkey,1)=1 AND att.attname='artist_id';
  IF fk IS NOT NULL THEN EXECUTE format('ALTER TABLE commissions DROP CONSTRAINT %I', fk); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='commissions_artist_fk') THEN
    ALTER TABLE commissions ADD CONSTRAINT commissions_artist_fk
      FOREIGN KEY (artist_id) REFERENCES artists(id) ON DELETE SET NULL;
  END IF;

  -- #7 same-venue composite FK for the hall context.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='commissions_hall_id_venue_halls_id_fk') THEN
    ALTER TABLE commissions DROP CONSTRAINT commissions_hall_id_venue_halls_id_fk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='commissions_hall_venue_fk') THEN
    IF v >= 150000 THEN
      ALTER TABLE commissions ADD CONSTRAINT commissions_hall_venue_fk
        FOREIGN KEY (hall_id, venue_id) REFERENCES venue_halls(id, venue_id) ON DELETE SET NULL (hall_id);
    ELSE
      ALTER TABLE commissions ADD CONSTRAINT commissions_hall_venue_fk
        FOREIGN KEY (hall_id, venue_id) REFERENCES venue_halls(id, venue_id) ON DELETE RESTRICT;
    END IF;
  END IF;
END $$;

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS hall_id integer;
CREATE INDEX IF NOT EXISTS reviews_hall_idx ON reviews (hall_id);
DO $$
DECLARE v int := current_setting('server_version_num')::int;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reviews_hall_id_venue_halls_id_fk') THEN
    ALTER TABLE reviews DROP CONSTRAINT reviews_hall_id_venue_halls_id_fk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reviews_hall_venue_fk') THEN
    IF v >= 150000 THEN
      ALTER TABLE reviews ADD CONSTRAINT reviews_hall_venue_fk
        FOREIGN KEY (hall_id, venue_id) REFERENCES venue_halls(id, venue_id) ON DELETE SET NULL (hall_id);
    ELSE
      ALTER TABLE reviews ADD CONSTRAINT reviews_hall_venue_fk
        FOREIGN KEY (hall_id, venue_id) REFERENCES venue_halls(id, venue_id) ON DELETE RESTRICT;
    END IF;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 12. BACKFILL (idempotent) — #8
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v RECORD;
  new_org_id integer;
  default_hall_id integer;
  default_set_id integer;
BEGIN
  -- 12a. One organization + owner membership per existing venue owner.
  FOR v IN
    SELECT DISTINCT vn.user_id FROM venues vn
    WHERE vn.user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM partner_organization_members m WHERE m.user_id = vn.user_id)
  LOOP
    INSERT INTO partner_organizations (type, display_name, legal_name, id_number, legal_address, billing_email, status)
    SELECT COALESCE(NULLIF(la.partner_type,'')::partner_org_type,'company'),
           COALESCE(NULLIF(la.legal_name,''), vn.name_ro, 'Organizație'),
           NULLIF(la.legal_name,''), NULLIF(la.id_number,''), NULLIF(la.legal_address,''),
           vn.email, 'active'
    FROM venues vn
    LEFT JOIN LATERAL (
      SELECT partner_type, legal_name, id_number, legal_address FROM legal_acceptances la2
      WHERE la2.user_id = v.user_id AND la2.subject_type = 'venue'
      ORDER BY la2.accepted_at DESC LIMIT 1
    ) la ON true
    WHERE vn.user_id = v.user_id ORDER BY vn.id LIMIT 1
    RETURNING id INTO new_org_id;

    INSERT INTO partner_organization_members (organization_id, user_id, role, is_active)
    VALUES (new_org_id, v.user_id, 'owner', true)
    ON CONFLICT (organization_id, user_id) DO NOTHING;

    UPDATE venues SET organization_id = new_org_id, updated_at = now()
    WHERE user_id = v.user_id AND organization_id IS NULL;
  END LOOP;

  -- 12b. Exactly one legacy-default hall per venue + default menu set, and
  --      backfill the hall/menu/interval/snapshot data hanging off it.
  FOR v IN SELECT vn.* FROM venues vn LOOP
    -- default hall
    SELECT id INTO default_hall_id FROM venue_halls WHERE venue_id = v.id AND is_legacy_default LIMIT 1;
    IF default_hall_id IS NULL THEN
      INSERT INTO venue_halls (venue_id, slug, name_ro, name_ru, name_en,
        capacity_min, capacity_max, pricing_model, base_price, currency,
        facilities, working_hours, buffer_minutes, is_legacy_default, status, sort_order)
      VALUES (v.id, 'principal', COALESCE(v.name_ro,'Sala principală'), v.name_ru, v.name_en,
        v.capacity_min, v.capacity_max, 'per_person', v.price_per_person::numeric, 'EUR',
        COALESCE(v.facilities,'[]'::jsonb), v.working_hours, v.buffer_minutes, true,
        CASE WHEN v.is_active THEN 'active'::partner_entity_status ELSE 'draft'::partner_entity_status END, 0)
      ON CONFLICT (venue_id, slug) DO NOTHING
      RETURNING id INTO default_hall_id;
      IF default_hall_id IS NULL THEN
        SELECT id INTO default_hall_id FROM venue_halls WHERE venue_id = v.id AND is_legacy_default LIMIT 1;
      END IF;
    END IF;

    -- default menu set
    SELECT id INTO default_set_id FROM venue_menu_sets WHERE venue_id = v.id AND is_default LIMIT 1;
    IF default_set_id IS NULL THEN
      INSERT INTO venue_menu_sets (venue_id, name_ro, is_default, sort_order)
      VALUES (v.id, 'Meniu principal', true, 0) RETURNING id INTO default_set_id;
    END IF;
    INSERT INTO venue_hall_menu_sets (hall_id, menu_set_id, venue_id)
    VALUES (default_hall_id, default_set_id, v.id) ON CONFLICT DO NOTHING;

    -- 12c. legacy menu rows → default set (only untagged rows)
    UPDATE venue_menu_categories SET menu_set_id = default_set_id WHERE venue_id = v.id AND menu_set_id IS NULL;
    UPDATE venue_menu_packages   SET menu_set_id = default_set_id WHERE venue_id = v.id AND menu_set_id IS NULL;
    UPDATE menu_scan_cache       SET menu_set_id = default_set_id WHERE venue_id = v.id AND menu_set_id IS NULL;

    -- 12d. existing venue bookings → default hall + canonical interval + tz + currency + snapshot
    UPDATE booking_requests b SET
      hall_id = COALESCE(b.hall_id, default_hall_id),
      reservation_scope = COALESCE(b.reservation_scope, 'hall'),
      timezone = COALESCE(b.timezone, 'Europe/Chisinau'),
      starts_at = COALESCE(b.starts_at,
        CASE WHEN b.event_date IS NOT NULL
             THEN ((b.event_date::text || ' ' || COALESCE(NULLIF(b.start_time,''),'00:00'))::timestamp AT TIME ZONE 'Europe/Chisinau')
             ELSE NULL END),
      ends_at = COALESCE(b.ends_at,
        CASE WHEN b.event_date IS NOT NULL AND NULLIF(b.end_time,'') IS NOT NULL
             THEN ((b.event_date::text || ' ' || b.end_time)::timestamp AT TIME ZONE 'Europe/Chisinau')
             ELSE NULL END),
      agreed_currency = COALESCE(b.agreed_currency, CASE WHEN b.agreed_price IS NOT NULL THEN 'EUR' ELSE b.agreed_currency END),
      commercial_snapshot = COALESCE(b.commercial_snapshot,
        CASE WHEN b.confirmed_at IS NOT NULL THEN jsonb_build_object(
          'venueId', v.id, 'hallId', default_hall_id, 'hallName', COALESCE(v.name_ro,'Sala principală'),
          'agreedPrice', b.agreed_price, 'currency', COALESCE(b.agreed_currency,'EUR'),
          'source', 'backfill_0028') ELSE NULL END)
    WHERE b.venue_id = v.id;

    -- 12e. commission hall + name snapshots for this venue
    UPDATE commissions c SET
      hall_id = COALESCE(c.hall_id, default_hall_id),
      hall_name_snapshot = COALESCE(c.hall_name_snapshot, COALESCE(v.name_ro,'Sala principală')),
      venue_name_snapshot = COALESCE(c.venue_name_snapshot, v.name_ro)
    WHERE c.venue_id = v.id;

    default_hall_id := NULL; default_set_id := NULL;
  END LOOP;

  -- 12f. Link existing venue legal acceptances to the venue's organization.
  UPDATE legal_acceptances la SET organization_id = vn.organization_id
  FROM venues vn
  WHERE la.subject_type = 'venue' AND la.venue_id = vn.id
    AND la.organization_id IS NULL AND vn.organization_id IS NOT NULL;

  -- 12g. Legacy non-booking calendar blocks → whole-venue schedule blocks.
  --      Conservative: only manual/google 'blocked' rows that are NOT tied to a
  --      booking (booking_id IS NULL) become whole-venue blocks (hall_id NULL).
  INSERT INTO venue_schedule_blocks (venue_id, hall_id, starts_at, ends_at, kind, reason, source)
  SELECT ce.entity_id, NULL,
         (ce.date::text || ' ' || COALESCE(NULLIF(ce.start_time,''),'00:00'))::timestamp AT TIME ZONE 'Europe/Chisinau',
         (ce.date::text || ' ' || COALESCE(NULLIF(ce.end_time,''),'23:59'))::timestamp AT TIME ZONE 'Europe/Chisinau',
         CASE WHEN ce.source = 'google_sync' THEN 'external_calendar'::schedule_block_kind ELSE 'manual'::schedule_block_kind END,
         ce.note, 'backfill_0028:calendar_events'
  FROM calendar_events ce
  WHERE ce.entity_type = 'venue' AND ce.status = 'blocked' AND ce.booking_id IS NULL
    AND EXISTS (SELECT 1 FROM venues vv WHERE vv.id = ce.entity_id)
    AND NOT EXISTS (
      SELECT 1 FROM venue_schedule_blocks b
      WHERE b.venue_id = ce.entity_id AND b.source = 'backfill_0028:calendar_events'
        AND b.starts_at = (ce.date::text || ' ' || COALESCE(NULLIF(ce.start_time,''),'00:00'))::timestamp AT TIME ZONE 'Europe/Chisinau'
    );
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 13. GRANTS — new tables are server-side only (#9)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r text; t text; s text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      FOREACH t IN ARRAY ARRAY[
        'partner_organizations','partner_organization_members','venue_halls',
        'venue_hall_seating_options','venue_menu_sets','venue_hall_menu_sets',
        'venue_schedule_blocks','venue_hall_conflict_groups','venue_hall_conflict_group_members'
      ] LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', t, r);
      END LOOP;
      -- Revoke on the new tables' identity sequences too.
      FOR s IN
        SELECT sequence_name FROM information_schema.sequences
        WHERE sequence_schema='public' AND sequence_name = ANY (ARRAY[
          'partner_organizations_id_seq','partner_organization_members_id_seq',
          'venue_halls_id_seq','venue_hall_seating_options_id_seq','venue_menu_sets_id_seq',
          'venue_schedule_blocks_id_seq','venue_hall_conflict_groups_id_seq'])
      LOOP
        EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM %I', s, r);
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 14. POST-MIGRATION INVARIANTS
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE bad integer; noowner integer;
BEGIN
  SELECT count(*) INTO bad FROM venues WHERE user_id IS NOT NULL AND organization_id IS NULL;
  IF bad > 0 THEN RAISE EXCEPTION 'backfill invariant failed: % owned venues without organization', bad; END IF;

  -- Exactly one legacy-default hall per venue.
  SELECT count(*) INTO bad FROM venues vn
  WHERE (SELECT count(*) FROM venue_halls h WHERE h.venue_id = vn.id AND h.is_legacy_default) <> 1;
  IF bad > 0 THEN RAISE EXCEPTION 'backfill invariant failed: % venues without exactly one default hall', bad; END IF;

  SELECT count(*) INTO bad FROM booking_requests WHERE venue_id IS NOT NULL AND hall_id IS NULL;
  IF bad > 0 THEN RAISE EXCEPTION 'backfill invariant failed: % venue bookings without a hall', bad; END IF;

  -- Owner-less venues are left for administrative review (no invented identity).
  SELECT count(*) INTO noowner FROM venues WHERE user_id IS NULL AND organization_id IS NULL;
  RAISE NOTICE '0028 OK. Venues needing admin review (no owner, no org): %', noowner;
END $$;

COMMIT;
