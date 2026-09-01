-- The signed document itself, kept with the signature.
--
-- Until now an acceptance stored only the slug, the version and a sha256 of
-- the text. That is enough to DETECT drift and useless for anything else:
-- documents.json holds exactly one version per slug, so the moment a document
-- is superseded the wording its holder actually agreed to is gone, and the
-- admin's "view document" link resolves to whatever the pack says today.
-- Replacing acord-parteneri v1.0 with v2.0 makes that concrete — every
-- signature already collected now points at text that no longer exists.
--
-- So the blocks are frozen onto the row. Three requirements collapse into
-- this one column: the admin can read the whole signed document, the partner
-- can re-read their own copy, and the hash finally has something to be
-- checked against.
--
-- document_blocks stores what was RENDERED, annex included — the web signer
-- sees `legalBlocksFor` (base text plus their own Annex 5) while the old hash
-- covered only the base, so the attestation was narrower than the display.
ALTER TABLE legal_acceptances
  ADD COLUMN IF NOT EXISTS document_title  text,
  ADD COLUMN IF NOT EXISTS document_blocks jsonb;

-- A readable rendering of the user agent, resolved once at signing time.
-- The raw string is kept as-is in user_agent; this is what an admin reads.
ALTER TABLE legal_acceptances
  ADD COLUMN IF NOT EXISTS device_summary text;

COMMENT ON COLUMN legal_acceptances.document_blocks IS
  'Frozen copy of the exact blocks shown to the signer, annex included. The hash in content_hash is taken over these.';
COMMENT ON COLUMN legal_acceptances.device_summary IS
  'Human-readable device/browser derived from user_agent at signing time.';
