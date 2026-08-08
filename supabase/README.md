# Supabase

Local Supabase configuration and migrations.

## Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Copy credentials to `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. Copy database connection strings for Prisma:
   - `DATABASE_URL` — pooled connection (port 6543)
   - `DIRECT_URL` — direct connection (port 5432)

## Auth providers

Enable in Supabase Dashboard → Authentication → Providers:

- Email
- Google (optional for Phase 1)

## Storage buckets

Create in Supabase Dashboard → Storage:

| Bucket | Public read | Write path |
|--------|-------------|------------|
| `avatars` | Yes | Validated server action (service role) |
| `credentials` | **No** | Validated teacher credential uploads (PDF/JPG/PNG/WebP, max 3 MB) |
| `teacher-intros` | Yes | Signed browser upload (MP4/WebM, max 80 MB), confirmed server-side |

The teacher-onboarding upload action accepts JPG, PNG, and WebP files up to 2 MB and validates
the binary file signature before storage. Qualification credentials accept PDF or image files up
to 3 MB.

Introduction videos upload directly from the browser to `teacher-intros` via a short-lived signed
upload URL. The server validates ownership, object existence, size, and MP4/WebM signatures before
persisting `introVideoUrl` / `introVideoPath` on the teacher profile. The bucket is created
automatically on first upload when the service role can manage storage; otherwise create it in the
Dashboard with public read, MIME types `video/mp4` and `video/webm`, and an 80 MB file size limit.

The `course-covers`, `course-media` and `course-files` buckets are retired. They belonged to the
courses product, which was removed. `20260731010000_storage_hardening` still creates them and is
already applied, so it cannot be edited; `20260808140000_drop_course_bucket_rows` deletes the rows
afterwards when they are empty. On an environment that still holds course objects the migration
skips them with a NOTICE, because Supabase's `storage.protect_delete()` trigger forbids deleting
storage rows in SQL. Empty and remove those buckets with `npm run storage:remove-course-buckets`.

## RLS

Row-level security policies live in `supabase/migrations/`. Application-level auth in `src/server/` is primary; RLS is defense-in-depth.

Apply `20260719234500_storage_hardening.sql` after reviewing existing bucket contents. It keeps
avatars public, makes credentials and case evidence private, and grants
authenticated users access only to objects rooted in their own user path. Validated server actions
use the service role and continue to bypass storage RLS. Do not add anonymous policies for sensitive
buckets; serve downloads through short-lived signed URLs after application authorization. New
credential uploads are stored as protected application download URLs; re-upload credentials whose
database records still contain legacy Supabase public URLs before making the bucket private.

## Local development

```bash
npx prisma migrate dev
npx prisma db seed
```

Or link Supabase CLI for local stack:

```bash
npx supabase init
npx supabase start
```
