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

The teacher-onboarding upload action accepts JPG, PNG, and WebP files up to 2 MB and validates
the binary file signature before storage. Qualification credentials accept PDF or image files up
to 3 MB.

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
