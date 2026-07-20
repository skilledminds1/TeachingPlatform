# Reliable email and notifications

Email is written to PostgreSQL before delivery. Application requests never call Resend directly.

## Delivery flow

1. `createNotification` persists the in-app notification.
2. Allowed email categories are rendered with the escaped shared template and inserted into
   `email_outbox` with a unique idempotency key.
3. Vercel calls `GET /api/v1/jobs/process-email-outbox` every five minutes with the existing
   `CRON_SECRET` bearer authorization.
4. The worker atomically claims due rows, sends through the configured provider, and records every
   attempt in `email_delivery_logs`.
5. Failures retry after 1, 2, 4, 8, and 16 minutes by default. Exhausted messages remain visible as
   `failed`, are logged, and are reported to Sentry when configured.

Processing locks older than 15 minutes are reclaimable. Delivery status is available to platform
admins at `/admin/email-delivery`.

## Providers

- `EMAIL_PROVIDER=resend` requires `RESEND_API_KEY` and uses `RESEND_FROM_EMAIL`.
- `EMAIL_PROVIDER=console` records delivery metadata in structured application logs without sending.
- If omitted, Resend is selected when its key exists; otherwise Console is used.

Console is intended for local development. Production should explicitly set `EMAIL_PROVIDER=resend`.

## Preferences

Students and teachers can independently control lesson reminders, new-message emails, and marketing.
Security, payment, legal, administrative mediation, invitations, and essential transactional emails
are mandatory. Missing preference rows use privacy-conscious defaults: reminders on, messages and
marketing off.

## Operations

Run migrations through the direct PostgreSQL connection:

```bash
PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1 npx prisma migrate deploy
```

The advisory-lock override is required for this deployment environment. Failed rows are intentionally
not deleted; retain them for diagnosis and manually requeue only after resolving the underlying issue.
