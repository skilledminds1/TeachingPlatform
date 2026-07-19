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
| `credentials` | Yes | Validated teacher credential uploads (PDF/JPG/PNG/WebP, max 3 MB) |
| `teacher-intros` | Yes | Signed browser upload (MP4/WebM, max 80 MB), confirmed server-side |
| `course-media` | **No** | Signed browser upload under `<teacher>/<course>/<lesson>/` |

The teacher-onboarding upload action accepts JPG, PNG, and WebP files up to 2 MB and validates
the binary file signature before storage. Qualification credentials accept PDF or image files up
to 3 MB.

Introduction videos upload directly from the browser to `teacher-intros` via a short-lived signed
upload URL. The server validates ownership, object existence, size, and MP4/WebM signatures before
persisting `introVideoUrl` / `introVideoPath` on the teacher profile. The bucket is created
automatically on first upload when the service role can manage storage; otherwise create it in the
Dashboard with public read, MIME types `video/mp4` and `video/webm`, and an 80 MB file size limit.

Course videos and resources are stored in the private `course-media` bucket. The application creates
the bucket when the service role can manage storage, with a 500 MB bucket limit and the MIME types
listed in `src/lib/validations/courses.ts`. Uploads use short-lived signed upload URLs. Confirmation
checks teacher/course/lesson path ownership, stored size and MIME metadata, and file signatures for
MP4, WebM, PDF, JPG, PNG, and WebP. Playback and downloads always use short-lived signed URLs after
teacher, administrator, or active-enrollment authorization; do not add public read policies.

## RLS

Row-level security policies live in `supabase/migrations/`. Application-level auth in `src/server/` is primary; RLS is defense-in-depth.

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
