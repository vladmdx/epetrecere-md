-- Durable, server-only index of complete incoming RFC 822 messages.
BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE TABLE IF NOT EXISTS public.inbound_email_archive (
  email_id uuid PRIMARY KEY,
  received_at timestamptz NOT NULL,
  from_address text NOT NULL,
  recipients text[] NOT NULL,
  subject text NOT NULL,
  message_id text NOT NULL,
  blob_path text NOT NULL,
  byte_length integer NOT NULL,
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbound_email_archive_size_chk CHECK (byte_length > 0 AND byte_length <= 41943040),
  CONSTRAINT inbound_email_archive_sha256_chk CHECK (sha256 ~ '^[0-9a-f]{64}$')
);

DO $$
DECLARE expected text[] := ARRAY[
  'email_id:uuid:NO', 'received_at:timestamp with time zone:NO',
  'from_address:text:NO', 'recipients:ARRAY:NO', 'subject:text:NO',
  'message_id:text:NO', 'blob_path:text:NO', 'byte_length:integer:NO',
  'sha256:text:NO', 'created_at:timestamp with time zone:NO'
];
DECLARE actual text[];
BEGIN
  SELECT array_agg(column_name || ':' || data_type || ':' || is_nullable ORDER BY ordinal_position)
    INTO actual
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'inbound_email_archive';
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'inbound_email_archive schema differs from expected shape';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS inbound_email_archive_received_idx
  ON public.inbound_email_archive (received_at);
ALTER TABLE public.inbound_email_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inbound_email_archive FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.inbound_email_archive FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
COMMENT ON TABLE public.inbound_email_archive IS
  'Private inbound email archive metadata. Complete RFC 822 source is in a private Blob store; only server-side admin routes may read it.';
COMMIT;
