# Deployment

## Overview

Deploy on **Vercel** with **Supabase** (PostgreSQL, Auth, Storage, Realtime).

## Infrastructure

```
Vercel (Next.js)
  ├── Supabase (Auth, DB, Storage, Realtime)
  ├── PayFast (platform subscriptions)
  ├── PayFast + PayPal (student→teacher payments)
  └── LiveKit Cloud (video sessions)
```

## Environments

| Environment | Branch | Purpose |
|-------------|--------|---------|
| Development | local | Local dev |
| Preview | feature branches | PR review |
| Staging | staging | Pre-prod + PayFast sandbox |
| Production | main | Live users |

## Environment Variables

```bash
# Database
DATABASE_URL=
DIRECT_URL=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# App
NEXT_PUBLIC_APP_URL=

# PayFast (subscriptions only)
PAYFAST_MERCHANT_ID=
PAYFAST_MERCHANT_KEY=
PAYFAST_PASSPHRASE=
PAYFAST_SANDBOX=true

# Teacher payment providers
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=

# Video
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

# Email
RESEND_API_KEY=

# Jobs and protected readiness
CRON_SECRET=
HEALTH_SECRET=

# Distributed rate limiting - REQUIRED IN PRODUCTION (see Rate limiting below)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Optional monitoring
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
```

## Local Setup

```bash
git clone git@github.com:skilledminds1/TeachingPlatform.git
cd TeachingPlatform
npm install
cp .env.example .env.local
npx prisma migrate dev
npx prisma db seed
npm run dev
```

## CI/CD

GitHub Actions on every PR:

- Lint, typecheck, test, build
- Prisma client generation and schema validation (no database-mutating migration command)

Deploy: Vercel auto-deploy on merge.

The workflow uses non-secret placeholder values and does not connect to or mutate a database.
Apply reviewed Prisma and Supabase migrations separately through the deployment process.

For managed PostgreSQL environments where migration advisory locks are unavailable or handled
by the deployment platform, deploy the reviewed migration set with Prisma's advisory lock disabled:

```bash
PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1 npx prisma migrate deploy
```

Run this as a single deployment job before starting application instances. Do not run concurrent
migration jobs.

## Supabase Setup

1. Create project (separate for staging/production)
2. Enable Email + Google auth
3. Storage buckets and their RLS policies are applied automatically by
   `prisma migrate deploy` (prisma/migrations/20260731010000_storage_hardening).
   No manual SQL step is required.

## Monitoring

- Vercel Analytics + Logs
- Supabase dashboard
- Sentry when a DSN is configured; leave DSNs empty to disable it
- `/api/v1/health` uptime check
- `/api/v1/health/ready` deep readiness check with `Authorization: Bearer $HEALTH_SECRET`

## Scheduled jobs

`vercel.json` invokes session reminders every 15 minutes, pending-payment expiry every
10 minutes, and the idempotent subscription lifecycle job daily at 02:15 UTC. The lifecycle
job applies trial expiry, scheduled plan/cancellation changes, complimentary expiry, and
day 0/3/6 dunning notices. Vercel sends `Authorization: Bearer $CRON_SECRET`; set the same long random
secret in every deployed environment. Job routes intentionally bypass session middleware
and reject requests unless this header matches.

## Rate limiting

Upstash Redis is **required in production**. Limits must be shared across instances:
each serverless instance holds its own in-memory counter and cold starts reset it, so the
fallback limiter provides effectively no protection against a distributed — or merely
parallel — attacker.

Credential-guarding actions (sign-in, sign-up, password reset, password change, password
recovery) are marked `critical` and **fail closed** when no shared store is configured and
`NODE_ENV=production`: they return a temporary-unavailable error rather than silently
accepting unlimited attempts. Non-critical actions still fall back to the in-memory limiter.

Rate-limit buckets key on the client IP taken from the **rightmost** forwarded hop (or a
platform-set header such as `x-vercel-forwarded-for`), never the client-supplied leftmost
hop. Auth actions additionally bucket on the submitted email, so a distributed attacker
cannot spread attempts across many IPs to hammer one account.

The process-local limiter is intended for local development and single-instance testing only.

## Performance Targets

| Metric | Target |
|--------|--------|
| FCP | < 1.5s |
| TTI | < 3.0s |
| API p95 | < 500ms |
| Uptime | 99.9% |

## Live URLs

- Production: https://www.amazing-skills.com (also https://amazing-skills.com)
- Vercel preview alias: https://amazing-skills.vercel.app
- Health: `/api/v1/health`
- PayPal webhook: `/api/v1/webhooks/paypal`
- PayFast ITN: `/api/v1/webhooks/payfast`

## Launch Checklist

- [x] Production Supabase configured (Site URL + redirect URLs)
- [x] PayFast live credentials (subscriptions)
- [ ] PayPal partner app configured (teacher lesson linking)
- [x] LiveKit Cloud URL and production API credentials
- [x] All env vars in Vercel
- [x] Domain DNS pointed at Vercel (GoDaddy A `@` → `76.76.21.21`, CNAME `www` → `cname.vercel-dns.com`)
- [x] PayPal webhook registered (`PAYPAL_WEBHOOK_ID`)
- [x] Migrations applied / verified on production DB
- [ ] Platform admin seeded
- [ ] Rotate PayPal client secret (shared in chat)
- [ ] Security checklist complete
