# API

## Overview

**Server Actions** for mutations; **Server Components** for reads. REST routes only for webhooks and health checks.

## Payment-related routes

| Route | Purpose | Auth |
|-------|---------|------|
| `POST /api/v1/webhooks/payfast` | PayFast ITN — **platform subscriptions only** | Signature |
| `GET /api/v1/payments/stripe/callback` | Stripe Connect OAuth return | Teacher session |
| `GET /api/v1/payments/paypal/callback` | PayPal OAuth return | Teacher session |
| `POST /api/v1/webhooks/paypal` | PayPal — student→teacher booking payment | Signature |
| `POST /api/v1/webhooks/stripe` | Stripe Connect — student→teacher booking payment | Signature |
| `GET /api/v1/health` | Health check | None |

**Platform never webhooks for teacher disbursements** — only subscription and booking confirmation from teacher's payment provider.

## Server Actions (by feature)

### Auth — `src/actions/auth.ts`
`signUp`, `signIn`, `signOut`, `resetPassword`

### Organizations — `src/actions/organization-invites.ts`
`createOrganizationInvite`, `acceptOrganizationInvite`, `revokeOrganizationInvite`

### Teacher onboarding — `src/actions/teacher-onboarding.ts`
`uploadTeacherAvatar`, `saveTeacherOnboarding`, `submitTeacherProfile`

### Admin — `src/actions/admin.ts`
`approveTeacherProfile`, `rejectTeacherProfile`, `moderateReview`

### Bookings — `src/actions/bookings.ts`
`createBooking`, `cancelBooking`

### Availability — `src/actions/availability.ts`
`saveWeeklyAvailability`, `addAvailabilityException`, `deleteAvailabilityException`

### Video — `src/actions/video.ts`
`confirmBookingAndCreateRoom`, `startSession`, `getJoinCredentials`, `endSession`

### Billing — `src/actions/billing.ts`
`createSubscriptionCheckout` (hosted PayFast for Free→paid; in-place PayFast update for paid upgrades)

### Teacher Payments — `src/actions/payment-linking.ts`
`startStripeConnect`, `startPayPalConnect`, `disconnectPaymentAccount`

### Reviews — `src/actions/reviews.ts`
`submitReview`; moderation is handled by `moderateReview` in `src/actions/admin.ts`

### Messaging — `src/actions/messaging.ts`
`sendMessage`, `startConversationWithTeacher`

### Notifications — `src/actions/notifications.ts`
`markNotificationRead`, `markAllNotificationsRead`

### Jobs
`GET /api/v1/jobs/session-reminders` — emails + in-app alerts for confirmed lessons starting in ~1 hour

## Response Conventions

```typescript
{ success: true, data: T }
{ success: false, error: string, code: ErrorCode }
```

Codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `RATE_LIMITED`, `PLAN_LIMIT_EXCEEDED`, `INTERNAL_ERROR`

## Validation

All inputs validated with Zod in `src/lib/validations/`.

## Rate Limiting

| Type | Limit |
|------|-------|
| Auth | 10/min per IP |
| Webhooks | Signature only |
| General | 100/min per user |

## Versioning

REST API prefix: `/api/v1/`
