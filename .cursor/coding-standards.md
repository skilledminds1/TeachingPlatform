# Coding Standards

## Required Stack

Always use:

| Tool | Role |
|------|------|
| TypeScript | All application code |
| Prisma | Database access |
| Supabase | Auth, storage, realtime |
| Tailwind | Styling |
| shadcn/ui | UI primitives |
| React Hook Form | Form state |
| Zod | Validation + RHF resolver |
| TanStack Query | Client-side server-state fetching and caching |

## Hard Rules

Never use `any`.

Never duplicate interfaces.

Never use inline styles.

Keep components below 300 lines.

Extract reusable hooks.

Extract reusable services.

Use clean folder structures.

Comment only complex logic.

---

## TypeScript

- Enable strict mode. Never use `any` — use `unknown` and narrow.
- Prefer `interface` for object shapes; `type` for unions and utilities.
- Export types from `src/types/` only when shared across features; otherwise colocate in the feature folder.
- Use explicit return types on exported functions.

### Type Deduplication

Never duplicate interfaces. Define each shape once and derive variants:

```typescript
// src/lib/validations/course.ts — single source of truth
export const CreateCourseSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  organizationId: z.string().uuid(),
});
export type CreateCourseInput = z.infer<typeof CreateCourseSchema>;

// Derive — do not redefine
type UpdateCourseInput = Partial<Pick<CreateCourseInput, "title" | "description">>;
```

```typescript
// ❌ BAD
export async function getCourse(id) {
  return db.course.findUnique({ where: { id } });
}

// ✅ GOOD
export async function getCourse(id: string): Promise<Course | null> {
  return db.course.findUnique({ where: { id } });
}
```

## Folder Structure

```
src/
├── app/              # Routes and layouts only
├── features/         # Feature modules (components, hooks, types)
├── components/       # Shared UI and layout
├── actions/          # Server actions
├── server/           # DB queries and business logic
├── services/         # External API integrations
├── lib/              # Config, db client, validations
├── hooks/            # Shared custom hooks
├── types/            # Shared TypeScript types
└── utils/            # Pure utility functions
```

- Colocate feature code under `src/features/[feature]/`
- Pages in `src/app/` must be thin — compose feature components
- Do not create files outside this structure

## Stack Usage

### Prisma

- All database access server-side via `src/lib/db.ts`
- No raw SQL — use Prisma query API
- Delegate logic to `src/server/` modules

### Supabase

- Browser client: `src/lib/supabase/client.ts`
- Server client: `src/lib/supabase/server.ts`
- Never use the service role key in client code

### React Hook Form + Zod

All forms use `useForm` with `zodResolver`. Schemas live in `src/lib/validations/`.

```tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreateCourseSchema, type CreateCourseInput } from "@/lib/validations/course";

const form = useForm<CreateCourseInput>({
  resolver: zodResolver(CreateCourseSchema),
  defaultValues: { title: "", organizationId: "" },
});
```

Use shadcn/ui `Form` components to wire fields to React Hook Form.

### TanStack Query

- Use for client components that need polling, refetch, or cache invalidation
- Prefer Server Components for initial page data reads
- Colocate query keys in `src/features/[feature]/queries.ts`

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { courseKeys } from "@/features/courses/queries";

const { data, isLoading, error } = useQuery({
  queryKey: courseKeys.list(orgId),
  queryFn: () => fetchCourses(orgId),
});
```

Always handle `isLoading`, `error`, and empty data states.

## Naming

| Kind | Convention | Example |
|------|------------|---------|
| Files (components) | PascalCase | `CourseCard.tsx` |
| Files (utilities) | kebab-case | `format-date.ts` |
| Components | PascalCase | `CourseCard` |
| Hooks | camelCase, `use` prefix | `useEnrollment` |
| Server actions | camelCase verbs | `createCourse` |
| Constants | SCREAMING_SNAKE | `MAX_FILE_SIZE` |
| DB models | PascalCase singular | `Course`, `Organization` |

## React & Next.js

- Functional components only. No class components.
- Server Components by default; add `"use client"` only when needed (state, effects, events).
- Keep components below 300 lines — split into sub-components or extract hooks when exceeded.
- Extract reusable logic into custom hooks in `src/hooks/` or `src/features/[feature]/hooks/`.
- Never use inline styles — use Tailwind utility classes only.
- Comment only complex logic — do not narrate obvious code.

```tsx
// ❌ BAD — business logic in page
export default async function Page() {
  const courses = await prisma.course.findMany();
  return <div>{courses.map(...)}</div>;
}

// ✅ GOOD — delegate to feature + server module
export default async function Page() {
  const courses = await getCoursesForUser(userId);
  return <CourseList courses={courses} />;
}
```

## Hooks & Services

### Reusable Hooks

Extract when logic is used in 2+ components or a component exceeds 300 lines:

```
src/hooks/use-debounce.ts           # shared across features
src/features/courses/hooks/use-course-form.ts  # feature-specific
```

### Reusable Services

| Location | Use for |
|----------|---------|
| `src/server/` | Database queries, auth checks, business rules |
| `src/services/` | External APIs (PayFast, PayPal, LiveKit, email) |

Never put business logic or API calls directly in UI components.

## Imports

Order: external → internal aliases (`@/`) → relative → types.

```typescript
import { z } from "zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { createCourse } from "@/actions/courses";
import type { Course } from "@/types/course";
```

Use the `@/` path alias for all internal imports.

## Error Handling

```typescript
// ❌ BAD
try {
  await createCourse(data);
} catch (e) {}

// ✅ GOOD
try {
  await createCourse(data);
} catch (error) {
  console.error("Failed to create course", error);
  return { success: false, error: "Unable to create course" };
}
```

Use typed error classes in `src/lib/errors.ts` for domain errors (`ForbiddenError`, `NotFoundError`).

## Validation

- All external input validated with Zod before use
- Schemas in `src/lib/validations/` — export schema and inferred type together
- Server actions parse input with Zod before any database write
- Forms validate via React Hook Form + `zodResolver`

## Testing

- Unit tests in `tests/` mirroring `src/` structure
- Test file naming: `[name].test.ts` or `[name].test.tsx`
- Use Vitest (when configured)

## Formatting

- 2-space indentation
- Double quotes for strings
- Trailing commas in multiline structures
- No unused imports or variables

---

## Related Rules

- `rules.md` — Master project rules
- `ui.md` — Component layout, accessibility, shadcn/ui patterns
- `database.md` — Prisma schema and query conventions
- `security.md` — Auth, RBAC, secrets
- `api.md` — Server actions and API routes
