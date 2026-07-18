# Database

## Overview

PostgreSQL via **Prisma ORM**, hosted on Supabase. Auth identities live in Supabase Auth; application data in Prisma.

## Entity Relationship

```
User ────────────── OrganizationMember ────── Organization
 │                                                │
 ├── TeacherProfile ── Subject(s)                │
 │        │                                       │
 │        ├── ProfileApproval (platform admin)    │
 │        ├── TeacherPaymentAccount (PayPal/Stripe)│
 │        └── Review                              │
 │                                                │
 ├── Availability / AvailabilityException         │
 │                                                │
 ├── Booking ────── VideoSession (Daily.co)       │
 │                                                │
 ├── Subscription ── Plan (PayFast)              │
 │                                                │
 └── Message / Notification                       │
```

## Core Entities

### User

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK; matches Supabase auth user id |
| email | String | Unique |
| name | String | |
| avatarUrl | String? | |
| timezone | String | IANA, e.g. `Africa/Johannesburg` |
| isPlatformAdmin | Boolean | Default false; manual provisioning |
| createdAt / updatedAt / deletedAt | DateTime | |

### Organization

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| name | String | |
| slug | String | Unique |
| planId | UUID | FK → Plan |
| payfastToken | String? | PayFast subscription token |
| subscriptionStatus | Enum | active, past_due, cancelled, trialing |
| createdAt / updatedAt / deletedAt | DateTime | |

### OrganizationMember

| userId + organizationId | Composite PK |
| role | Enum | admin, instructor, student |

### TeacherProfile

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| userId | UUID | FK → User, unique |
| organizationId | UUID | FK → Organization |
| bio | Text | Min 100 words for submission |
| headline | String? | |
| hourlyRateCents | Int | Display currency per teacher locale |
| currency | String | ZAR default |
| subjects | Relation | Many-to-many via TeacherSubject |
| status | Enum | draft, pending_approval, approved, rejected |
| rejectionReason | String? | |
| slug | String | Unique, public URL |
| createdAt / updatedAt / deletedAt | DateTime | |

### Subject

| id | UUID | e.g. Mathematics, English |
| name | String | Unique |
| slug | String | |

### TeacherPaymentAccount

Teacher-linked payout methods — **not platform-controlled**.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| userId | UUID | FK → User |
| provider | Enum | paypal, stripe |
| providerAccountId | String | Encrypted OAuth/account id |
| isDefault | Boolean | |
| isActive | Boolean | |
| createdAt / updatedAt | DateTime | |

### Availability / AvailabilityException

Weekly recurring slots + one-off blocks.

| Field | Type | Notes |
|-------|------|-------|
| dayOfWeek | Int? | 0–6 for recurring |
| startTime / endTime | Time | Local to teacher timezone |
| isBlocked | Boolean | Exception: block a slot |
| specificDate | DateTime? | One-off exception |

### Booking

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| teacherId | UUID | FK → User |
| studentId | UUID | FK → User |
| organizationId | UUID | FK → Organization |
| startsAt / endsAt | DateTime | UTC |
| status | Enum | pending_payment, confirmed, cancelled, completed, no_show |
| hourlyRateCents | Int | Snapshot at booking time |
| currency | String | |
| paymentProvider | Enum? | paypal, stripe |
| paymentExternalId | String? | Provider transaction id |
| cancellationReason | String? | |
| createdAt / updatedAt | DateTime | |

### VideoSession

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| bookingId | UUID | FK → Booking, unique |
| dailyRoomName | String | Daily.co room id |
| dailyRoomUrl | String | |
| status | Enum | scheduled, live, ended |
| startedAt / endedAt | DateTime? | |

### Review

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| bookingId | UUID | FK → Booking |
| studentId | UUID | FK → User |
| teacherId | UUID | FK → User |
| rating | Int | 1–5 |
| comment | Text | |
| status | Enum | pending, approved, rejected |
| teacherResponse | Text? | One response allowed |
| createdAt / updatedAt | DateTime | |

### Plan / Subscription

| Plan | Fields |
|------|--------|
| Plan | name, slug, priceCents, currency, studentLimit, features (JSON), payfastRecurringAmount |
| Subscription | organizationId, planId, payfastToken, status, currentPeriodEnd, trialEndsAt |

### Notification / Message

Standard messaging and notification tables — see Phase 8 implementation.

### AdminAuditLog

| Field | Type | Notes |
|-------|------|-------|
| adminUserId | UUID | FK → User |
| action | String | e.g. `profile.approved` |
| targetType / targetId | String / UUID | |
| metadata | Json? | |
| createdAt | DateTime | |

## Future Entities (Post-v1)

Course, Module, Lesson, Assignment, Quiz — only if LMS features are added later.

## Prisma Conventions

- UUID primary keys, `createdAt`, `updatedAt`, `deletedAt` where appropriate
- `@@map("snake_case")` for tables; `@map("snake_case")` for columns
- Index all FKs and searchable fields (slug, email, status, startsAt)
- Enums for all status fields

## Supabase Auth Sync

On signup: Supabase Auth trigger or app hook creates Prisma `User` row with same UUID.

## Row-Level Security

RLS in `supabase/migrations/` as defense-in-depth. Application auth in `src/server/` is primary.

## Seeding

`prisma/seed.ts`: demo org, teacher, student, platform admin (`isPlatformAdmin: true`), subjects.
