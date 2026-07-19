# Features

## Product Focus

Amazing Skills is a **live tutoring marketplace** (Preply / AmazingTalker model). Features are organized by phase in [TODO.md](../TODO.md).

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

- Weekly availability with multiple windows per day
- Starter+ blocked-date and extra-hour exceptions
- Teacher and student booking calendars with detail views
- Teacher-local availability converted to UTC reservations and viewer-local display
- 60-minute slot selection with a two-hour minimum notice period
- Serializable booking creation with overlap and active-student plan-limit enforcement
- Upcoming booking cancellation with a required reason and 24-hour policy notice
- New reservations remain `pending_payment` until Phase 7 checkout is connected

---

## Phase 5 — Video Sessions

- Private LiveKit Cloud room provisioned for each confirmed booking
- Two-participant limit, room expiry, and short-lived participant-only meeting tokens
- Teacher owner permissions for screen sharing and session control
- Authenticated lobby and embedded join flow for teacher and student
- Shared Classroom hub (`/dashboard/classroom`) to join or reconnect to lessons
- Session lifecycle: scheduled → live → ended
- Booking lifecycle completion or no-show when the session closes
- Post-session student review prompt with platform moderation

---

## Phase 6 — Subscriptions (PayFast)

- Plan selection (Free, Starter, Professional, Business)
- PayFast recurring billing
- Monthly and annual USD catalog pricing with PayFast ZAR conversion
- Active-student and monthly live-lesson hour enforcement
- Free: 2 hours and 1 course; Starter: 20 hours; Professional: 75 hours; Business: unlimited fair use
- Billing history, upgrade/downgrade, trial, grace period

---

## Phase 7 — Teacher Payments (PayFast / PayPal)

- Teacher links PayFast or PayPal in settings
- Student pays teacher at booking checkout
- Platform does NOT handle these funds
- Payment confirmation via PayFast/PayPal webhooks
- Teacher earnings summary (from provider data)

---

## Phase 8 — Communication

- Teacher↔student in-app messaging with one conversation per pair
- Signed-in students can contact approved teachers before booking
- Teachers receive in-app alerts for new messages and lesson requests
- Teachers receive an in-app notification and email when their profile is approved
- Notification center with mark-read and mark-all-read
- Email via Resend for booking created, booking confirmed, and session reminders
- Session reminder job for confirmed lessons starting in 45–75 minutes

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
