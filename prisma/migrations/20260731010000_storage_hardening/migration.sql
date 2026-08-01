-- SEC-17 — Move storage bucket configuration and RLS into the automated deploy path.
--
-- WHY
-- This SQL previously lived only in supabase/migrations/, applied by hand per the
-- instruction "Apply RLS from supabase/migrations/" in docs/Deployment.md. Nothing ran it:
-- no CI step, no deploy hook, and the Supabase CLI is not wired into package.json. Schema
-- changes flow through `prisma migrate deploy`, so in any fresh environment -- staging, a
-- disaster-recovery restore, a second region -- the tables would exist while the buckets
-- holding teacher ID documents, paid course video, and moderation evidence kept Supabase's
-- default policies. Exactly the one-time manual step a solo founder forgets.
--
-- Folding it in here makes bucket configuration a normal migration. The statements are
-- idempotent, so applying it alongside the pre-existing supabase/ copy is harmless.
--
-- SAFETY
-- The whole block is skipped when the `storage` schema is absent, so a plain Postgres used
-- for local development or CI does not fail the migration.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RAISE NOTICE 'storage schema not present; skipping bucket hardening';
    RETURN;
  END IF;

  -- Bucket visibility. `public` is the setting that decides whether objects are readable
  -- without a signed URL, so it is the single most important value here.
  --   avatars       public  - profile images rendered on public marketplace pages
  --   course-covers public  - course artwork rendered on public sales pages
  --   credentials   private - teacher qualification and ID-style documents
  --   course-media  private - paid lesson video, served via short-lived signed URLs
  --   course-files  private - paid lesson resources
  --   case-evidence private - trust and safety evidence
  --
  -- `course-covers` is included because uploadCourseCover writes to it and reads back a
  -- public URL, yet nothing ever created it: on a fresh deploy every cover upload failed,
  -- and a cover is mandatory to submit a course, so no course could be published at all.
  INSERT INTO storage.buckets (id, name, public)
  VALUES
    ('avatars', 'avatars', true),
    ('course-covers', 'course-covers', true),
    ('credentials', 'credentials', false),
    ('course-media', 'course-media', false),
    ('course-files', 'course-files', false),
    ('case-evidence', 'case-evidence', false)
  ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

  -- Object policies. The application reads and writes with the service role, which bypasses
  -- these entirely; they exist so that a client holding only the publishable key cannot
  -- reach another user's objects.
  DROP POLICY IF EXISTS "avatar owner write" ON storage.objects;
  CREATE POLICY "avatar owner write"
    ON storage.objects FOR ALL TO authenticated
    USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
    WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

  DROP POLICY IF EXISTS "course cover owner write" ON storage.objects;
  CREATE POLICY "course cover owner write"
    ON storage.objects FOR ALL TO authenticated
    USING (bucket_id = 'course-covers' AND (storage.foldername(name))[1] = auth.uid()::text)
    WITH CHECK (bucket_id = 'course-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

  DROP POLICY IF EXISTS "credential owner read" ON storage.objects;
  CREATE POLICY "credential owner read"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'credentials' AND (storage.foldername(name))[1] = auth.uid()::text);

  DROP POLICY IF EXISTS "course object owner access" ON storage.objects;
  CREATE POLICY "course object owner access"
    ON storage.objects FOR ALL TO authenticated
    USING (
      bucket_id IN ('course-media', 'course-files')
      AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
      bucket_id IN ('course-media', 'course-files')
      AND (storage.foldername(name))[1] = auth.uid()::text
    );

  DROP POLICY IF EXISTS "case evidence owner access" ON storage.objects;
  CREATE POLICY "case evidence owner access"
    ON storage.objects FOR ALL TO authenticated
    USING (
      bucket_id = 'case-evidence'
      AND (storage.foldername(name))[1] = 'case-evidence'
      AND (storage.foldername(name))[3] = auth.uid()::text
    )
    WITH CHECK (
      bucket_id = 'case-evidence'
      AND (storage.foldername(name))[1] = 'case-evidence'
      AND (storage.foldername(name))[3] = auth.uid()::text
    );
END
$$;
