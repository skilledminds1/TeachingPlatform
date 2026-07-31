-- SEC-01 — Deny-all row-level security on every application table.
--
-- WHY THIS IS NEEDED
-- The Supabase publishable ("anon") key ships to the browser by design, and Supabase
-- exposes the `public` schema through PostgREST. Until this migration, no table had RLS
-- enabled and no privileges were revoked, so anyone holding that public key could read and
-- write every row directly -- users, payment_attempts, messages, calendar_connections
-- (which stores Google OAuth refresh tokens in plaintext) -- completely bypassing every
-- requireAuth() check in the application.
--
-- WHY THIS IS SAFE FOR THE APP
-- All application data access goes through Prisma on DATABASE_URL/DIRECT_URL, which
-- connects as `postgres` -- the table owner. A table owner BYPASSES row-level security
-- when RLS is merely ENABLEd. Verified before writing this: the browser Supabase client
-- (src/lib/supabase/client.ts) is used only for auth, and there are zero `supabase.from()`,
-- `.channel()` or postgres_changes subscriptions anywhere in src/. Nothing in the browser
-- reads a `public` table, so denying anon/authenticated breaks nothing.
--
-- DO NOT ADD `FORCE ROW LEVEL SECURITY`.
-- FORCE applies RLS to the table owner as well. Because this migration deliberately creates
-- NO policies, FORCE would deny every Prisma query and take the entire application down.
-- ENABLE (without FORCE) is exactly the posture we want: owner passes, everyone else is
-- denied by the absence of any policy.
--
-- If a future feature genuinely needs browser-side reads of a table, grant that ONE table
-- explicitly and write a policy for it. Do not weaken this migration wholesale.

-- 1. Enable RLS on every base table in `public`.
--    Done as a loop rather than a hand-written list so no existing table is missed and the
--    statement stays correct as the schema grows.
DO $$
DECLARE
  target RECORD;
BEGIN
  FOR target IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'          -- ordinary tables only; skips views and sequences
      AND NOT c.relrowsecurity      -- idempotent: skip tables already protected
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target.table_name);
  END LOOP;
END
$$;

-- 2. Remove the default PostgREST-facing grants. RLS alone is sufficient, but revoking
--    privileges as well means a future `CREATE POLICY ... USING (true)` mistake on one
--    table cannot silently expose it.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- 3. Apply the same posture to anything created later, so a new Prisma migration does not
--    quietly reintroduce the hole.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- 4. Withdraw schema-level access entirely. Nothing in the browser touches `public`.
REVOKE USAGE ON SCHEMA public FROM anon, authenticated;

-- 5. Fail the migration loudly if any table slipped through, rather than reporting success
--    on a partially-applied security fix.
DO $$
DECLARE
  unprotected TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
  INTO unprotected
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND NOT c.relrowsecurity;

  IF unprotected IS NOT NULL THEN
    RAISE EXCEPTION 'RLS not enabled on: %', unprotected;
  END IF;
END
$$;
