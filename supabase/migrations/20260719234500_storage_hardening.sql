-- SUPERSEDED (SEC-17): this now lives in
-- prisma/migrations/20260731010000_storage_hardening/migration.sql, so it is applied
-- automatically by `prisma migrate deploy` instead of by hand. Kept for reference and
-- because it may already have been applied to an existing project; do not edit this copy.
-- The Prisma version is idempotent and additionally provisions the course-covers bucket.

-- Defense-in-depth storage configuration. Server-side service-role access bypasses
-- these policies and remains available for validated application actions.
insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('credentials', 'credentials', false),
  ('course-media', 'course-media', false),
  ('course-files', 'course-files', false),
  ('case-evidence', 'case-evidence', false)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "avatar owner write" on storage.objects;
create policy "avatar owner write"
on storage.objects for all to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "credential owner read" on storage.objects;
create policy "credential owner read"
on storage.objects for select to authenticated
using (bucket_id = 'credentials' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "course object owner access" on storage.objects;
create policy "course object owner access"
on storage.objects for all to authenticated
using (
  bucket_id in ('course-media', 'course-files')
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id in ('course-media', 'course-files')
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "case evidence owner access" on storage.objects;
create policy "case evidence owner access"
on storage.objects for all to authenticated
using (
  bucket_id = 'case-evidence'
  and (storage.foldername(name))[1] = 'case-evidence'
  and (storage.foldername(name))[3] = auth.uid()::text
)
with check (
  bucket_id = 'case-evidence'
  and (storage.foldername(name))[1] = 'case-evidence'
  and (storage.foldername(name))[3] = auth.uid()::text
);
