-- Remove the three course bucket rows.
--
-- Why this is a separate migration from 20260808120000_remove_courses: that one may already be
-- applied, and Prisma checksums applied migrations. Editing it again would report drift.
--
-- Why it is needed at all: 20260731010000_storage_hardening is applied and checksummed, so it
-- cannot be edited either — and it INSERTs 'course-covers', 'course-media' and 'course-files'.
-- Every freshly provisioned environment (staging, a DR restore, a second region) therefore
-- recreates three buckets for a product that no longer exists, complete with a public
-- 'course-covers'. Dropping the rows here runs after it and leaves the end state correct.
--
-- Supabase's storage.protect_delete() trigger blocks DELETE on storage.objects, so this can
-- only remove buckets that are already EMPTY — which is exactly the fresh-environment case
-- this migration exists for. On an environment that still holds course media the delete is
-- skipped and a NOTICE points at the Storage API script, which is the only thing that can
-- empty it:
--
--     npm run storage:remove-course-buckets -- --yes
--
-- The whole block is exception-guarded. A storage schema that is absent, shaped differently,
-- or protected by a trigger on buckets as well must not fail the migration and block a deploy
-- over three orphaned rows.
DO $$
DECLARE
  remaining integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    RETURN;
  END IF;

  SELECT count(*) INTO remaining
  FROM storage.objects
  WHERE bucket_id IN ('course-covers', 'course-media', 'course-files');

  IF remaining > 0 THEN
    RAISE NOTICE 'Leaving course buckets in place: % object(s) still stored. Run: npm run storage:remove-course-buckets -- --yes', remaining;
    RETURN;
  END IF;

  DELETE FROM storage.buckets
  WHERE id IN ('course-covers', 'course-media', 'course-files');
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not remove course bucket rows (%). Remove them with: npm run storage:remove-course-buckets -- --yes', SQLERRM;
END $$;
