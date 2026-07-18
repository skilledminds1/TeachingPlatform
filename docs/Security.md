# Security

## Overview

Amazing Skills handles profiles, bookings, video sessions, and payment integrations. Security is layered: middleware, server actions, server modules, RLS.

## Authentication

- Supabase Auth — email/password + Google OAuth
- JWT in HTTP-only cookies
- Email verification required
- Session validated in middleware on protected routes

## Authorization

### Roles

| Role | Scope |
|------|-------|
| Platform Admin | Global — `isPlatformAdmin` flag |
| Org Admin | Organization |
| Instructor | Organization |
| Student | Organization |

Roles are per-organization except platform admin.

### Enforcement

1. Middleware — auth + route prefixes
2. Server actions — `requireUser()`, `requireRole()`, `requirePlatformAdmin()`
3. Server modules — org-scoped queries
4. Supabase RLS — defense in depth

## Payment Security

### PayFast (platform subscriptions)

- Merchant key and passphrase **server-only**
- ITN signature verification on every webhook
- Idempotent webhook processing
- Never log payment card data

### PayPal / Stripe (student → teacher)

- OAuth tokens encrypted at rest
- Teacher payment account IDs never exposed to client
- Webhook signatures verified for booking confirmation
- Platform does not store student payment methods

## Platform Admin

- `isPlatformAdmin` set only server-side / seed — never from client
- `/admin/*` routes blocked in middleware for non-admins
- All admin actions logged to `AdminAuditLog`

## Input Validation

- Zod on all writes
- Never trust client-provided userId, organizationId, role, or isPlatformAdmin
- Prisma parameterized queries only

## Upload Limits

| Type | Max | Types |
|------|-----|-------|
| Avatar | 2 MB | jpeg, png, webp |
| Profile media | 5 MB | jpeg, png, webp |

## Environment Variables

```bash
# Public
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY

# Server-only
DATABASE_URL
DIRECT_URL
SUPABASE_SERVICE_ROLE_KEY
PAYFAST_MERCHANT_ID
PAYFAST_MERCHANT_KEY
PAYFAST_PASSPHRASE
PAYPAL_CLIENT_ID
PAYPAL_CLIENT_SECRET
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
```

## Compliance

- **POPIA** (South Africa) — data deletion, consent, breach notification
- GDPR-aligned data export/delete flows
- FERPA-aware handling of session records

## Pre-Launch Checklist

- [ ] Middleware protects all routes
- [ ] Platform admin flag not client-writable
- [ ] PayFast ITN signature verified
- [ ] PayPal/Stripe webhooks verified
- [ ] RLS policies on Supabase tables
- [ ] No secrets in client bundle
- [ ] Rate limiting on auth endpoints
