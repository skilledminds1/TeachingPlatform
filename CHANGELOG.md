# Changelog

All notable changes to this project are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## How to Update

**Every time Cursor finishes a feature**, add entries under `[Unreleased]` before completing the task.

1. Pick the right category: `Added`, `Changed`, `Fixed`, `Removed`, or `Security`
2. Write one concise bullet per change — describe what changed, not how
3. Group related changes under the same category
4. When releasing, rename `[Unreleased]` to a version with date

```markdown
## [Unreleased]

### Added
- Course creation form with validation

### Changed
- Dashboard layout spacing increased

### Fixed
- Login redirect loop on expired session
```

## [Unreleased]

### Added

- Provider-neutral lesson payments with PayFast Split Payments (ZAR + Apple Pay/Google Pay) and PayPal multiparty checkout
- Teacher-selected lesson currencies (ZAR, USD, EUR, GBP, AUD, CAD) snapshotted onto bookings
- PaymentAttempt / PaymentEvent ledger with idempotent webhooks, payment-window expiry, and refund tracking
- Student booking checkout UI and teacher earnings summary from verified payment attempts
- Lesson payment feature flags and documentation in `docs/LessonPayments.md`
- Cron-friendly unpaid booking expiry job at `/api/v1/jobs/expire-pending-payments`
- Teacher↔student in-app messaging with conversation threads and unread indicators
- Notification center for booking updates, lesson reminders, and new messages
- Resend-backed transactional emails for booking creation, confirmation, and session reminders (skipped when `RESEND_API_KEY` is unset)
- Cron-friendly session reminder job at `/api/v1/jobs/session-reminders`
- Monthly live-lesson allowances: Free 2 hours, Starter 20 hours, Professional 75 hours, and Business unlimited fair use
- Serializable booking-time quota enforcement and teacher billing usage display
- Free one-course allowance and unlimited courses from Starter upward
- LiveKit Cloud React video rooms replacing the Daily.co iframe integration
- Private LiveKit Cloud rooms with deterministic provisioning and two-participant limits
- Participant-only, short-lived LiveKit JWTs with teacher room-admin permissions
- Video lesson lobby with teacher start/end controls, secure embedded room, and scheduled/live/ended lifecycle
- Automatic lesson confirmation after verified student payment webhooks (manual teacher bypass removed)
- Post-session student reviews with 1–5 star validation and moderation queue submission
- Teacher weekly availability editor with multiple daily windows, blocked dates, and extra-hour exceptions
- Timezone-aware 60-minute marketplace slots with two-hour notice, booking-conflict exclusion, and viewer-local display
- Concurrency-safe booking reservations that enforce teacher availability and active-student plan limits
- Student and teacher booking calendars, booking detail pages, pending-payment confirmation, and cancellation reasons
- Public marketplace at `/teachers` with keyword search, subject/price/rating filters, and sorting
- Public teacher profile pages with bio, subjects, verified qualifications, weekly availability, hourly rate, and approved reviews with aggregates
- Landing page subject cards now deep-link to filtered marketplace results
- Student dashboard with upcoming and recent lessons, live-session join, teacher list, review reminders, and marketplace shortcuts
- Free, Starter, Professional, and Business entitlement plans with monthly and annual USD pricing
- Teacher billing dashboard, automatic limit prompts, and PayFast hosted subscription checkout
- Signed, server-validated, idempotent PayFast webhook processing for subscription activation, failure, and cancellation
- Concurrency-safe active-student enforcement that blocks only new students at the plan limit
- Hashed, expiring organization invitations with acceptance and revocation flows
- Teacher qualification capture, submission gating, persistence, and admin moderation visibility
- PayPal OAuth account-linking foundation for direct teacher payments
- Four-step teacher onboarding flow with profile photo, personal details, 100-word biography, subjects, hourly rate, and review
- Secure Supabase avatar uploads with size, MIME, and binary-signature validation
- Teacher marketplace-readiness checklist and profile submission gating for verified email, payment account, and qualifying plan
- Platform admin dashboard with live user, organization, teacher, booking, review, and MRR metrics
- Admin moderation pages for teacher profiles and student reviews with immutable audit logging
- Admin organization, user, analytics, and audit-log views with responsive role-protected navigation
- Production-ready landing page: sticky nav, hero with trust points, subjects grid, features, for-teachers section, four-tier pricing, testimonials, FAQ, CTA, and multi-column footer under `src/features/marketing/`
- Email/password and Google OAuth authentication via Supabase Auth
- Login, register, forgot-password pages and OAuth callback route
- Prisma user sync on signup/sign-in (UUID aligned with Supabase Auth)
- Solo-teacher organization provisioning on teacher registration
- Session helpers: `requireAuth`, `requirePlatformAdmin`, `requireOrgMembership`
- Student, teacher, and platform admin dashboard entry routes
- Auth server actions: `signUp`, `signIn`, `signOut`, `resetPassword`, `signInWithGoogle`

### Fixed

- Button `render={<Link />}` no longer triggers Base UI nativeButton console errors
- Admin layout no longer redirects unexpected failures to login; only auth/forbidden are redirected
- Teacher signup now creates user and solo organization in one database transaction
- Incomplete teachers are redirected directly to onboarding after sign-in

### Changed

- Replaced Free/Pro/Academy/Enterprise ZAR plans with tool-focused USD tiers and two-month annual discounts
- Marketplace profiles, booking, messaging, one-to-one lessons, and direct payment linking are now Free entitlements
- Platform subscription checkout is displayed in USD and converted to ZAR for PayFast settlement
- Teacher avatar uploads limited to 2 MB with matching storage-bucket enforcement
- Middleware now refreshes Supabase sessions on all matched routes and protects app routes
- Configured Supabase project URL and publishable key in `.env.local`
- Fixed Prisma CLI to load `.env.local` via dotenv-cli; added database URL templates
- Unified payment model: PayFast and PayPal for direct student-to-teacher payments
- Replaced 8-phase LMS roadmap with 9-phase marketplace roadmap (video-first, courses deferred)
- Added docs/PayFast.md and docs/PlatformAdmin.md
- Updated PROJECT.md, TODO.md, all docs/, and .cursor/ rule files for consistency
- Reinforced CHANGELOG update requirement in `.cursor/rules.md` — mandatory after every completed feature
- Updated `.cursor/coding-standards.md` with required stack, hard rules, TanStack Query, and RHF + Zod standards
- Updated `.cursor/ui.md` with design philosophy (minimal, dark mode first, Apple/Linear/Notion inspired)
- Updated `.cursor/database.md` with normalization, UUID, indexing, and soft delete standards
- Updated `.cursor/security.md` with middleware, role-based route protection, rate limiting, and encryption standards
- Updated `.cursor/api.md` with REST conventions, typed responses, error handling, and logging standards

### Added

- Prisma schema with full marketplace entities (User, Organization, Plan, TeacherProfile, Booking, etc.)
- Prisma client singleton (`src/lib/db.ts`), seed script, and database npm scripts
- Supabase browser/server/admin clients and auth middleware
- Environment validation (`src/lib/env.ts`)
- shadcn/ui base components: Input, Label, Card, Field, Separator, Skeleton, Avatar, Sonner
- Next.js 16 project bootstrap (TypeScript, Tailwind v4, ESLint, Turbopack)
- `TODO.md` product backlog with 8 development phases
- Initial repository setup and GitHub connection
- Project folder structure (`src/`, `docs/`, `prisma/`, `supabase/`, `tests/`, etc.)
- Documentation scaffold in `docs/` (ProjectOverview, Vision, Architecture, Database, Features, Roadmap, API, UI, Security, Deployment)
- Cursor rules in `.cursor/` (rules, coding-standards, ui, database, security, api)
- Master Cursor project rules in `.cursor/rules.md`
- `CHANGELOG.md`
