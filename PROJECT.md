# Amazing Skills — Product Specification

> **This is the single source of truth for product decisions.** Cursor and all contributors must refer to this document before designing features, writing code, or making architectural choices. If a decision conflicts with this spec, the spec wins unless explicitly updated here first.

---

## Vision

**Mission:** Connect students with great teachers for live online learning — as easily as Preply or AmazingTalker, built for the South African market first.

**Long-term goal:** Amazing Skills becomes the go-to marketplace where students discover tutors, book live video sessions, and pay teachers directly — while teachers grow their practice through profiles, reviews, and a professional booking workflow.

**What we are:** An **online video tutoring marketplace** — not a traditional LMS.

**What we are not:** A course-heavy learning management system. Courses and assignments are optional, secondary features for a later phase.

**Core beliefs:**

1. **Teacher-first** — Help tutors get discovered, booked, and paid with minimal friction.
2. **Live learning** — Video calls are the core product, not an add-on.
3. **Platform stays out of teacher payouts** — Students pay teachers directly; the platform only collects subscriptions.
4. **Trust by default** — Approved profiles, moderated reviews, reliable video sessions.
5. **Quality over speed** — Production-ready code only; no placeholders.

---

## Target Audience

### Primary Users

| Segment | Description | Needs |
|---------|-------------|-------|
| **Independent tutors** | Solo educators offering 1-on-1 live lessons | Marketplace profile, bookings, video calls, direct payment from students |
| **Students & learners** | Anyone looking for a tutor | Discover teachers, book sessions, pay tutor, join video call |
| **Training organizations** | Small academies with multiple tutors | Team management, shared billing, student limits |

### Secondary Users

| Segment | Description |
|---------|-------------|
| **Platform administrators** | SkilledMinds staff — marketplace approval, review moderation |
| **Organization admins** | Workspace owners — members, billing, settings |

### Geographic Focus

- **Primary market:** South Africa (PayFast for platform subscriptions)
- **Secondary market:** International students and teachers (PayPal for student→teacher payments)

### Competitive Reference

Modelled after **Preply** and **AmazingTalker**:

- Public teacher marketplace with search and filters
- Teacher sets hourly rate and availability
- Student books a slot and pays the teacher directly
- Live video session at scheduled time
- Reviews after completed sessions

---

## Business Model

Amazing Skills operates as a **B2B2C marketplace SaaS**:

| Money flow | Who pays whom | Processor | Platform role |
|------------|---------------|-----------|---------------|
| **Subscription** | Teacher → Platform | **PayFast** | Platform revenue — only money the platform collects |
| **Session payment** | Student → Teacher | **PayFast or teacher's PayPal** | Platform does NOT handle, hold, or disburse these funds |

The platform **never** touches student-to-teacher payments. Teachers link PayFast or their own PayPal account in settings. Students pay the teacher directly at booking time through the teacher's connected payment method.

---

## Subscription Model

Subscriptions are billed at the **organization or solo-teacher account level** via **PayFast only**. Plan prices are presented in USD; PayFast converts the configured ZAR checkout amount and settles in ZAR.

### Plans

| Plan | Monthly | Annual | Active students | Live lessons | Courses |
|------|---------|--------|-----------------|--------------|---------|
| **Free** | $0 | Free | 1 | 2 hrs/month | 1 |
| **Starter** | $9 | $90 | 5 | 20 hrs/month | Unlimited |
| **Professional** | $19 | $190 | 15 | 75 hrs/month | Unlimited |
| **Business** | $39 | $390 | Unlimited | Unlimited (fair use) | Unlimited |

### What Each Plan Unlocks

| Capability | Free | Starter | Professional | Business |
|------------|------|-----|---------|------------|
| Marketplace profile | ✓ | ✓ | ✓ | ✓ |
| Bookings & messaging | ✓ | ✓ | ✓ | ✓ |
| Link PayFast/PayPal | ✓ | ✓ | ✓ | ✓ |
| Homework & student notes | ✗ | ✓ | ✓ | ✓ |
| Courses | 1 | Unlimited | Unlimited | Unlimited |
| Quizzes & groups | ✗ | ✗ | ✓ | ✓ |
| Team teachers & branding | ✗ | ✗ | ✗ | ✓ |
| Student limit | 1 | 5 | 15 | Unlimited |
| Live lesson hours / month | 2 | 20 | 75 | Unlimited (fair use) |

### Subscription Rules

1. **New-student limits** — Existing students remain available; only accepting a new student is blocked at the plan limit.
2. **Monthly live-lesson limits** — Pending, confirmed, and completed reservations share the organization quota; cancellation releases reserved time.
3. **Grace period** — 7 days after failed PayFast payment before restriction; read-only for 14 days.
4. **Downgrade protection** — Must remove excess students and remain within the target live-hour allowance.
5. **Billing cycle** — Monthly default; annual at 2 months free. Live-hour allowances reset each calendar month.
6. **Currency** — Catalog prices are USD; PayFast checkout and settlement use converted ZAR.

---

## Payment Philosophy

### Platform subscriptions (PayFast only)

- Teachers pay the platform via **PayFast** (cards, Instant EFT, SnapScan, etc.)
- Platform never stores card numbers — PayFast handles PCI compliance
- Webhook ITN verification on every subscription event
- Invoices generated automatically for subscription charges

### Teacher session payments (PayFast / PayPal — NOT platform)

- Teachers connect **PayFast** or their own PayPal account in profile settings
- Students pay the teacher **directly** at booking checkout
- Platform facilitates the checkout redirect/API call but **never holds funds**
- Platform takes **zero commission** on session payments in v1
- Refunds are handled between teacher and student via their payment provider

### Principles

1. **Transparency** — Teachers see subscription cost and direct session earnings separately.
2. **Separation** — Platform billing and teacher payouts are completely separate systems.
3. **No escrow** — Platform does not hold student payments.
4. **Secure linking** — PayPal OAuth and PayFast merchant details are never exposed to clients.

### Payment Flows

```
Subscription (Teacher → Platform via PayFast)
  Teacher selects plan → PayFast checkout → ITN webhook → Plan activated

Session (Student → Teacher via PayFast/PayPal)
  Student selects slot → Checkout via teacher's linked account → Payment to teacher
  Platform records booking as confirmed on payment webhook from PayFast/PayPal

Platform revenue = subscriptions only. Session payments bypass the platform ledger.
```

---

## Approval Workflow

### 1. Teacher Marketplace Approval

```
Teacher completes profile → Submits for review → Platform admin approves/rejects → Live on marketplace
```

**Requirements:** Pro plan+, verified email, complete profile (bio 100+ words, photo, subjects, hourly rate, PayFast or PayPal linked).

**SLA:** 48 business hours.

### 2. Organization Member Approval

- **Invite link** — Admin sends invite → User accepts → Auto-approved
- **Request to join** — User requests → Admin approves/rejects

### 3. Booking Confirmation

```
Student selects slot → Pays teacher (PayFast/PayPal) → Booking confirmed → Video room created
```

| Scenario | Behavior |
|----------|----------|
| Payment succeeds | Booking confirmed; video room link generated |
| Payment fails | Slot released; retry offered |
| Teacher cancels | Refund via teacher's payment provider; slot reopened |
| Student cancels (>24h) | Full refund per teacher policy |
| Student cancels (<24h) | Per teacher cancellation policy |

### 4. Review Moderation

```
Student submits review after completed session → Admin moderates → Published
```

Teachers may respond once per review.

---

## User Roles

Roles are **contextual per organization**, except Platform Admin which is global.

### Platform Admin (SkilledMinds)

- Provisioned via `User.isPlatformAdmin = true` (manual seed; no self-registration)
- Approve/reject marketplace profiles; moderate reviews
- View platform analytics and subscription revenue
- Access `/admin/*` routes only
- Cannot access org-private data without audit reason

### Organization Admin

- Manage org settings, PayFast subscription billing, members
- View team bookings and usage

### Instructor (Teacher)

- Manage profile, availability, hourly rate
- Link PayFast/PayPal for session payments
- Conduct video sessions; view bookings and earnings summary
- Message students

### Student

- Browse marketplace; book and pay teachers
- Join video sessions; leave reviews
- Message teachers

### Permission Matrix

| Action | Platform Admin | Org Admin | Instructor | Student |
|--------|:-:|:-:|:-:|:-:|
| Approve marketplace profiles | ✓ | | | |
| Manage org PayFast subscription | | ✓ | | |
| Link PayFast/PayPal | | | ✓ | |
| Set availability & rates | | | ✓ | |
| Book & pay for session | | | | ✓ |
| Join video session | | | ✓ | ✓ |
| Moderate reviews | ✓ | | | |

---

## Core Features (Phased)

See [TODO.md](TODO.md) for checklist.

| Phase | Focus |
|-------|-------|
| **1** | Foundation — landing, auth, roles, database |
| **2** | Dashboards — teacher, student, admin, platform admin |
| **3** | Marketplace — profiles, search, filters, reviews |
| **4** | Bookings — availability, calendar, timezone |
| **5** | Video sessions — embedded live calls (LiveKit Cloud) |
| **6** | Subscriptions — PayFast billing, plan limits |
| **7** | Teacher payments — PayFast/PayPal linking, student checkout |
| **8** | Communication — messaging, notifications, emails |
| **9** | Analytics & AI — reports, insights (courses optional later) |

---

## Live Video Strategy

**Provider:** [LiveKit Cloud](https://livekit.io/) with private rooms and signed participant tokens.

| Approach | Rationale |
|----------|-----------|
| **LiveKit Cloud** | Browser-based, no install, private rooms, React components, recording optional |
| Not Zoom links | Worse UX; doesn't match Preply model |
| Not custom WebRTC | Too complex for v1 |

Flow: Booking confirmed → server creates LiveKit room → authorized participants receive short-lived join tokens.

---

## Platform Admin Strategy

**Recommended:** `isPlatformAdmin` boolean on `User` model.

- Set manually via seed script or direct DB update for SkilledMinds staff
- Middleware checks `isPlatformAdmin` for `/admin/*` routes
- Separate admin layout — not mixed with org admin dashboard
- All admin actions logged to `AdminAuditLog` table

---

## Technical Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14+ (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS + shadcn/ui (dark mode first) |
| Forms | React Hook Form + Zod |
| Data fetching | Server components + server actions (no client data-fetching library) |
| Database | PostgreSQL via Prisma |
| Auth | Supabase Auth |
| Realtime | Supabase Realtime (chat, notifications) |
| Storage | Supabase Storage (avatars) |
| Platform billing | **PayFast** (subscriptions only) |
| Teacher payments | **PayFast + PayPal** (student → teacher) |
| Video | **LiveKit Cloud** |
| Email | Resend |
| Deployment | Vercel |

---

## Success Metrics

### North Star

**Completed video sessions per month** — measures marketplace liquidity and core product usage.

### Primary KPIs (Year 1)

| Metric | Target |
|--------|--------|
| Registered teachers | 500 |
| Paying subscribers (Pro+) | 100 |
| MRR (PayFast subscriptions) | R50,000 |
| Completed bookings/month | 200 |
| Booking payment success rate | > 95% |
| NPS | ≥ 40 |

---

## Document Hierarchy

1. **PROJECT.md** (this file)
2. **TODO.md**
3. **docs/**
4. **.cursor/**
5. **CHANGELOG.md**

---

## Related Documents

| Document | Purpose |
|----------|---------|
| [TODO.md](TODO.md) | Product backlog |
| [docs/PayFast.md](docs/PayFast.md) | PayFast subscription integration |
| [docs/PlatformAdmin.md](docs/PlatformAdmin.md) | Platform admin spec |
| [docs/Database.md](docs/Database.md) | Full data model |
| [docs/Roadmap.md](docs/Roadmap.md) | Development phases |
