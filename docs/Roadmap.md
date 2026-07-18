# Roadmap

## Overview

Nine phases delivering a Preply-style tutoring marketplace. Sequential phases; items within a phase may be parallelized.

**Source of truth:** [PROJECT.md](../PROJECT.md) and [TODO.md](../TODO.md)

---

## Phase 1 — Foundation

**Goal:** Runnable app with auth, roles, core schema, landing page.

| Task | Status |
|------|--------|
| Initialize Next.js (TS, Tailwind, shadcn, RHF, Zod, TanStack Query) | Pending |
| Configure Prisma + Supabase | Pending |
| `.env.example` and environment docs | Pending |
| Supabase Auth (email + Google) | Pending |
| User ↔ Prisma sync on signup | Pending |
| Core schema: User, Organization, OrganizationMember | Pending |
| Platform admin flag (`isPlatformAdmin`) | Pending |
| Middleware + RBAC helpers | Pending |
| Landing page (pricing, CTAs) | Pending |
| CI pipeline + staging deploy | Pending |

**Exit criteria:** User signs up, creates org, sees role-appropriate shell.

**Duration:** 2–3 weeks

---

## Phase 2 — Dashboards

**Goal:** Role-specific dashboards and app shell.

| Task | Status |
|------|--------|
| App shell (dark mode first, sidebar, top bar) | Pending |
| Teacher dashboard | Pending |
| Student dashboard | Pending |
| Org admin dashboard | Pending |
| Platform admin dashboard + layout | Pending |
| Profile edit + avatar upload | Pending |

**Exit criteria:** Each role sees correct dashboard; platform admin has separate `/admin` area.

**Duration:** 2 weeks

---

## Phase 3 — Marketplace

**Goal:** Approved teachers discoverable with search and reviews.

| Task | Status |
|------|--------|
| TeacherProfile schema + CRUD | Pending |
| Profile completion + submit for approval | Pending |
| Platform admin approval queue | Pending |
| Public marketplace + teacher profile pages | Pending |
| Search + filters | Pending |
| Reviews + moderation | Pending |

**Exit criteria:** Teacher submits profile → admin approves → student finds teacher via search.

**Duration:** 3 weeks

---

## Phase 4 — Bookings

**Goal:** Schedule sessions with availability and timezones.

| Task | Status |
|------|--------|
| Availability schema + weekly schedule UI | Pending |
| Timezone handling (UTC storage, local display) | Pending |
| Calendar views | Pending |
| Booking creation + slot locking | Pending |
| Cancellation policies | Pending |

**Exit criteria:** Student selects available slot; booking created (payment in Phase 7).

**Duration:** 2–3 weeks

---

## Phase 5 — Video Sessions

**Goal:** Embedded live video for booked sessions.

| Task | Status |
|------|--------|
| Daily.co API integration | Pending |
| Create room per confirmed booking | Pending |
| Join session UI (teacher + student) | Pending |
| Session status lifecycle | Pending |
| Post-session review prompt | Pending |

**Exit criteria:** Both parties join video call from dashboard at scheduled time.

**Duration:** 2 weeks

---

## Phase 6 — Subscriptions (PayFast)

**Goal:** Platform monetization via PayFast subscriptions.

| Task | Status |
|------|--------|
| Plan + Subscription schema | Pending |
| PayFast subscription checkout | Pending |
| PayFast ITN webhook handler | Pending |
| Feature gates + student limits | Pending |
| Billing dashboard, trial, grace period | Pending |

**Exit criteria:** Teacher subscribes via PayFast; limits enforced.

**Duration:** 2–3 weeks

---

## Phase 7 — Teacher Payments

**Goal:** Students pay teachers via linked PayPal/Stripe.

| Task | Status |
|------|--------|
| PayPal OAuth linking | Pending |
| Stripe Connect linking | Pending |
| Student checkout at booking | Pending |
| PayPal/Stripe webhooks for confirmation | Pending |
| Teacher earnings summary | Pending |

**Exit criteria:** Student pays teacher directly; booking confirmed; platform never holds funds.

**Duration:** 3 weeks

---

## Phase 8 — Communication

**Goal:** Messaging and notifications.

| Task | Status |
|------|--------|
| In-app messaging (Supabase Realtime) | Pending |
| Notification center | Pending |
| Transactional emails (Resend) | Pending |

**Duration:** 2 weeks

---

## Phase 9 — Analytics & AI

**Goal:** Insights and optional AI features.

| Task | Status |
|------|--------|
| Instructor analytics | Pending |
| Platform admin reports | Pending |
| CSV/PDF export | Pending |
| AI features (optional) | Pending |

**Duration:** 2–3 weeks

---

## Timeline Summary

| Phase | Duration |
|-------|----------|
| 1 — Foundation | 2–3 weeks |
| 2 — Dashboards | 2 weeks |
| 3 — Marketplace | 3 weeks |
| 4 — Bookings | 2–3 weeks |
| 5 — Video | 2 weeks |
| 6 — Subscriptions | 2–3 weeks |
| 7 — Teacher Payments | 3 weeks |
| 8 — Communication | 2 weeks |
| 9 — Analytics | 2–3 weeks |

**Total:** ~20–24 weeks

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07 | Preply/AmazingTalker model over LMS-first | User priority: live tutoring marketplace |
| 2026-07 | PayFast for platform subscriptions only | SA market; platform revenue separation |
| 2026-07 | PayPal + Stripe for student→teacher payments | Platform does not handle teacher payouts |
| 2026-07 | Daily.co for embedded video | Best UX for 1-on-1 browser sessions |
| 2026-07 | `isPlatformAdmin` on User model | Simplest secure admin provisioning |
| 2026-07 | 9-phase roadmap | Matches TODO.md and PROJECT.md |

---

## Post-v1 Backlog

- Light course/lesson support (optional LMS)
- Homework and quizzes
- Group video classes
- Mobile PWA
- Stripe for international platform billing (if needed)
- i18n
