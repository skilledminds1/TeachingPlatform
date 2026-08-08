# Architecture

## Overview

Full-stack TypeScript tutoring marketplace using Next.js App Router. Live 1:1 lessons only — the app hosts no sellable content. Feature-based folders; server-side data access; separate payment systems for platform vs teacher.

## High-Level Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      Client (Browser)                   │
│       React · TanStack Query · LiveKit components       │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                   Next.js App Router                    │
│         Pages · Layouts · Server Actions · API          │
└────────┬──────────────┬───────────────┬─────────────────┘
         │              │               │
         ▼              ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐
│ Prisma/PG   │  │  Supabase   │  │  External Services  │
│ App data    │  │ Auth·Storage│  │ PayFast (subs)      │
│             │  │  Realtime   │  │ Teacher's own PSP   │
└─────────────┘  └─────────────┘  │ LiveKit Cloud       │
                                  └─────────────────────┘
```

## Payment Architecture

Two completely separate payment systems:

| Flow | Direction | Provider | Platform role |
|------|-----------|----------|---------------|
| Subscription | Teacher → Platform | PayFast | Collects revenue — the only money the platform touches |
| Lesson | Student → Teacher | Teacher's own hosted checkout | Renders a link to it. No keys, no webhook, no funds — the platform is not a party |

## Layer Responsibilities

| Layer | Location | Purpose |
|-------|----------|---------|
| Pages | `src/app/` | Routes, thin layouts |
| Features | `src/features/` | Marketplace, bookings, video, billing |
| Components | `src/components/` | Shared UI |
| Actions | `src/actions/` | Mutations |
| Server | `src/server/` | Queries, auth, business rules |
| Services | `src/services/` | PayFast, LiveKit, Resend |
| Lib | `src/lib/` | db, supabase clients, validations |

## Request Flow (Booking Example)

```
1. Student selects slot on TeacherProfilePage
2. Client calls createBooking server action
3. Action validates session, plan limits, slot availability
4. Server module creates Booking (pending_payment)
5. Link out to the teacher's own hosted checkout
6. Webhook confirms payment → Booking confirmed
7. Server creates LiveKit room → VideoSession record
8. Notifications sent (Phase 8)
```

## Authentication Flow

1. Supabase Auth sign-in
2. JWT in HTTP-only cookie
3. Middleware validates session
4. Server reads user + org membership + isPlatformAdmin
5. RBAC in server modules

## Realtime

In-app messaging and notifications (Phase 8); Realtime can be added later for live updates.

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| PayFast subscriptions only | SA market; clear revenue separation |
| Teacher's own payment link for lessons | The platform never possesses the funds, which is the line every payments regime draws |
| LiveKit Cloud video | Secure JWT access and flexible 1-on-1 React UI |
| isPlatformAdmin flag | Simple secure admin provisioning |
| No hosted course content | Hosting and gating course video makes the platform the deemed supplier for EU/UK VAT — see [Why courses are out of scope](../PROJECT.md#why-courses-are-out-of-scope) |

## Environment Variables

See [Deployment.md](Deployment.md) for full list.

## Future Considerations

- Background jobs for email queues
- Search upgrade (Elasticsearch) if PostgreSQL full-text insufficient
- Recording storage for video sessions
