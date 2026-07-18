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

- Production-ready landing page: sticky nav, hero with trust points, subjects grid, features, for-teachers section, pricing (Free/Pro/Academy), testimonials, FAQ, CTA, and multi-column footer under `src/features/marketing/`
- Email/password and Google OAuth authentication via Supabase Auth
- Login, register, forgot-password pages and OAuth callback route
- Prisma user sync on signup/sign-in (UUID aligned with Supabase Auth)
- Solo-teacher organization provisioning on teacher registration
- Session helpers: `requireAuth`, `requirePlatformAdmin`, `requireOrgMembership`
- Student, teacher, and platform admin dashboard entry routes
- Auth server actions: `signUp`, `signIn`, `signOut`, `resetPassword`, `signInWithGoogle`

### Fixed

- Button `render={<Link />}` no longer triggers Base UI nativeButton console errors

### Changed

- Middleware now refreshes Supabase sessions on all matched routes and protects app routes
- Configured Supabase project URL and publishable key in `.env.local`
- Fixed Prisma CLI to load `.env.local` via dotenv-cli; added database URL templates
- Unified payment model: PayFast (platform subscriptions only), PayPal/Stripe (student→teacher)
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
