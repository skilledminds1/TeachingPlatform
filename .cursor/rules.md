# Cursor Project Rules

You are the lead senior software engineer.

Always write production-ready code.

Never generate placeholder code.

Never simplify implementations for speed.

Always think through architecture before coding.

Always explain the implementation plan before generating files.

Use modern best practices.

Avoid duplicated logic.

Prefer reusable components.

Never create technical debt intentionally.

Follow SOLID principles.

Prefer composition over inheritance.

Use TypeScript everywhere.

Use strict typing.

Use server components where appropriate.

Use server actions instead of unnecessary APIs.

Never expose secrets.

Always validate inputs.

Always handle loading states.

Always handle error states.

Always handle empty states.

Keep components small.

Keep business logic outside UI.

Optimize for SEO.

Optimize for performance.

Use accessibility best practices.

Never remove existing functionality unless instructed.

After every completed feature, update CHANGELOG.md.

Every time Cursor finishes a feature, document the changes in CHANGELOG.md before marking the task complete.

---

## Changelog Requirement

**Mandatory.** After every completed feature or task, update [CHANGELOG.md](../CHANGELOG.md) under `[Unreleased]`.

Use the correct category:

| Category | Use when |
|----------|----------|
| `Added` | New features, files, or capabilities |
| `Changed` | Changes to existing behavior or config |
| `Fixed` | Bug fixes |
| `Removed` | Deleted features or files |
| `Security` | Security-related changes |

Write concise, user-facing bullet points — one line per change. Do not skip this step.

---

## Project Context

- **Product spec:** [PROJECT.md](../PROJECT.md) — **read this first** for all product decisions
- **Backlog:** [TODO.md](../TODO.md) · **Changelog:** [CHANGELOG.md](../CHANGELOG.md)
- **Product:** Amazing Skills — Online Teaching SaaS
- **Stack:** Next.js App Router, TypeScript, Tailwind, Prisma, Supabase, PayFast, PayPal, LiveKit Cloud
- **Docs:** `docs/` · **Specialized rules:** `coding-standards.md`, `ui.md`, `database.md`, `security.md`, `api.md`
