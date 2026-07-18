# Deployment

## Overview

Deploy on **Vercel** with **Supabase** (PostgreSQL, Auth, Storage, Realtime).

## Infrastructure

```
Vercel (Next.js)
  ├── Supabase (Auth, DB, Storage, Realtime)
  ├── PayFast (platform subscriptions)
  ├── PayPal + Stripe (student→teacher payments)
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
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Video
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

# Email
RESEND_API_KEY=
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
- `prisma migrate diff` check

Deploy: Vercel auto-deploy on merge.

## Supabase Setup

1. Create project (separate for staging/production)
2. Enable Email + Google auth
3. Storage bucket: `avatars` (public read, auth write)
4. Apply RLS from `supabase/migrations/`

## Monitoring

- Vercel Analytics + Logs
- Supabase dashboard
- Sentry (planned)
- `/api/v1/health` uptime check

## Performance Targets

| Metric | Target |
|--------|--------|
| FCP | < 1.5s |
| TTI | < 3.0s |
| API p95 | < 500ms |
| Uptime | 99.9% |

## Launch Checklist

- [ ] Production Supabase configured
- [ ] PayFast live credentials (subscriptions)
- [ ] PayPal/Stripe apps configured (teacher linking)
- [ ] LiveKit Cloud URL and production API credentials
- [ ] All env vars in Vercel
- [ ] Migrations applied
- [ ] Platform admin seeded
- [ ] Security checklist complete
