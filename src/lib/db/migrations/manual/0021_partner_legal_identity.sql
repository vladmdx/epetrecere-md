-- The party details a signed contract has to name.
--
-- Until now an acceptance recorded WHO clicked (user, signature name, IP,
-- user agent, content hash) but nothing about the legal person being bound.
-- The Partner Agreement asks for exactly this in §5, and differently per
-- kind of partner: §5.2 an individual gives identification data, §5.3 a sole
-- trader gives a name, an identification number, an address and a
-- representative, §5.4 a legal entity gives its official name, IDNO,
-- registered office, tax status and administrator. Without them the contract
-- names only one of its two parties — the operator, in Anexa 4.
--
-- These live on the acceptance rather than on artists/venues on purpose. The
-- table is append-only, so what is written here is what the partner saw and
-- signed, frozen at that moment. A profile edited a year later cannot
-- retroactively change the terms someone agreed to, and the signed document
-- stays reproducible byte for byte.
--
-- The append-only trigger from 0017 covers these columns automatically: it
-- compares the whole row apart from the artist_id/venue_id linkage, so new
-- columns are protected from the moment they exist. Nothing to update there.
--
-- All nullable: acceptances already recorded predate the fields, and the
-- application decides which are required for which partner_type.
ALTER TABLE "legal_acceptances"
  ADD COLUMN IF NOT EXISTS "partner_type" text,
  ADD COLUMN IF NOT EXISTS "legal_name" text,
  ADD COLUMN IF NOT EXISTS "id_number" text,
  ADD COLUMN IF NOT EXISTS "legal_address" text,
  ADD COLUMN IF NOT EXISTS "representative_name" text;

COMMENT ON COLUMN "legal_acceptances"."partner_type" IS
  'individual | sole_trader | company — selects which §5 subsection applies';
COMMENT ON COLUMN "legal_acceptances"."id_number" IS
  'IDNP for an individual, IDNO for a sole trader or company';
