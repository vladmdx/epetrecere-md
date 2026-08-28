-- Supabase only. Middleware runs on the Edge runtime, which has no TCP
-- sockets, so on Supabase it reads the redirects table over PostgREST
-- instead of SQL (see src/middleware.ts).
--
-- The project was created with "automatically expose new tables" OFF, which
-- is the setting that matters here: this schema has no row-level security —
-- access control lives in the application — so exposing every table to the
-- Data API would have published users, contracts, chat and guest lists to
-- anyone holding the publishable key, which ships to every visitor's browser.
--
-- This grants exactly one table, and only SELECT. A redirect is already
-- public: any visitor can observe it as a 308. Granting it to `anon` means
-- middleware needs only the publishable key, never the secret one — an Edge
-- function with read access to slug redirects, and to nothing else.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT USAGE ON SCHEMA public TO anon;
    GRANT SELECT ON TABLE public.redirects TO anon;
  END IF;
END $$;
