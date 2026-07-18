# API

## Overview

**Server Actions** for mutations; **Server Components** for reads. REST routes only for webhooks and health checks.

## Payment-related routes

| Route | Purpose | Auth |
|-------|---------|------|
| `POST /api/v1/webhooks/payfast` | PayFast ITN — **platform subscriptions only** | Signature |
| `POST /api/v1/webhooks/paypal` | PayPal — student→teacher booking payment | Signature |
| `POST /api/v1/webhooks/stripe` | Stripe Connect — student→teacher booking payment | Signature |
| `GET /api/v1/health` | Health check | None |

**Platform never webhooks for teacher disbursements** — only subscription and booking confirmation from teacher's payment provider.

## Server Actions (by feature)

### Auth — `src/actions/auth.ts`
`signUp`, `signIn`, `signOut`, `resetPassword`

### Organizations — `src/actions/organizations.ts`
`createOrganization`, `inviteMember`, `updateMemberRole`, `removeMember`

### Marketplace — `src/actions/marketplace.ts`
`updateTeacherProfile`, `submitProfileForApproval`, `approveProfile` (platform admin), `rejectProfile` (platform admin)

### Bookings — `src/actions/bookings.ts`
`createBooking`, `cancelBooking`, `completeBooking`

### Video — `src/actions/video.ts`
`createVideoRoom`, `startSession`, `endSession`

### Billing — `src/actions/billing.ts`
`createPayFastSubscription`, `cancelSubscription`, `changePlan`

### Teacher Payments — `src/actions/teacher-payments.ts`
`linkPayPalAccount`, `linkStripeAccount`, `disconnectPaymentAccount`, `initiateStudentCheckout`

### Reviews — `src/actions/reviews.ts`
`submitReview`, `respondToReview`, `moderateReview` (platform admin)

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
