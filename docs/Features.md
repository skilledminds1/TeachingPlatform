# Features

## Product Focus

TeachingPlatform is a **live tutoring marketplace** (Preply / AmazingTalker model). Features are organized by phase in [TODO.md](../TODO.md).

**Core loop:** Discover teacher → Book slot → Pay teacher → Video session → Review

**Platform revenue:** Teacher subscriptions via PayFast only.

**Not in v1 focus:** Full LMS, course builder, homework, quizzes (future optional phase).

---

## Phase 1 — Foundation

### Authentication & Onboarding

- Email/password + OAuth (Google)
- Email verification, password reset
- Role assignment (instructor / student on signup)
- Organization creation or join via invite

### User Profile

- Name, avatar, bio, timezone
- Notification preferences

### Organization Management

- Create workspace, invite members, assign roles

---

## Phase 2 — Dashboards

- **Teacher:** Upcoming sessions, earnings summary, profile status, booking requests
- **Student:** Upcoming sessions, booked teachers, messages
- **Org admin:** Members, usage, billing link
- **Platform admin:** Approval queue, moderation queue, platform stats

---

## Phase 3 — Marketplace

- Teacher public profiles (bio, subjects, rate, reviews, availability preview)
- Marketplace listing with search and filters
- Profile submission and platform admin approval
- Reviews and ratings (moderated)

---

## Phase 4 — Bookings

- Weekly availability + exceptions
- Calendar (teacher & student views)
- Timezone-aware slot selection
- Booking creation and cancellation policies

---

## Phase 5 — Video Sessions

- Daily.co embedded video rooms per booking
- Join flow for teacher and student
- Session lifecycle: scheduled → live → completed
- Post-session review prompt

---

## Phase 6 — Subscriptions (PayFast)

- Plan selection (Free, Pro, Academy, Enterprise)
- PayFast recurring billing
- Student limit and feature gate enforcement
- Billing history, upgrade/downgrade, trial, grace period

---

## Phase 7 — Teacher Payments (PayPal / Stripe)

- Teacher links PayPal or Stripe in settings
- Student pays teacher at booking checkout
- Platform does NOT handle these funds
- Payment confirmation via PayPal/Stripe webhooks
- Teacher earnings summary (from provider data)

---

## Phase 8 — Communication

- In-app messaging (teacher ↔ student)
- Notification center
- Email: booking confirmed, session reminder, payment receipt, profile approved

---

## Phase 9 — Analytics & AI

- Instructor: sessions completed, earnings, review score trends
- Platform admin: MRR, active teachers, booking volume
- Export CSV/PDF
- AI insights (optional, post-v1)

---

## Feature Module Map

| Feature | Folder | Phase |
|---------|--------|-------|
| Auth | `src/features/auth/` | 1 |
| Profile | `src/features/profile/` | 1 |
| Organizations | `src/features/organizations/` | 1 |
| Dashboard | `src/features/dashboard/` | 2 |
| Marketplace | `src/features/marketplace/` | 3 |
| Reviews | `src/features/reviews/` | 3 |
| Bookings | `src/features/bookings/` | 4 |
| Availability | `src/features/availability/` | 4 |
| Video | `src/features/video/` | 5 |
| Billing | `src/features/billing/` | 6 |
| TeacherPayments | `src/features/teacher-payments/` | 7 |
| Messaging | `src/features/messaging/` | 8 |
| Notifications | `src/features/notifications/` | 8 |
| Analytics | `src/features/analytics/` | 9 |
| PlatformAdmin | `src/features/platform-admin/` | 2–3 |

---

## Out of Scope (v1)

- Course builder / LMS as primary product
- Platform escrow or teacher payouts
- Commission on session payments
- Native mobile apps
- Enterprise SSO
- SCORM / xAPI
