# API Rules

## Core Principles

Prefer Server Actions.

If API routes are required:

RESTful.

Typed responses.

Consistent error handling.

Authentication required where applicable.

Rate limiting.

Logging.

---

## Architecture

| Layer | Location | Purpose |
|-------|----------|---------|
| Server Actions | `src/actions/` | Primary mutation interface |
| Server Modules | `src/server/` | Queries and business logic |
| REST Routes | `src/app/api/v1/` | Webhooks and external access only |

**Default to Server Actions.** Only add REST routes when Server Actions cannot serve the use case (webhooks, third-party integrations, public health checks).

## Server Actions

### Pattern

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { CreateCourseSchema } from "@/lib/validations/course";
import { requireUser } from "@/server/auth";
import { createCourse as createCourseDb } from "@/server/courses/create-course";

export async function createCourse(input: unknown) {
  const user = await requireUser();
  const data = CreateCourseSchema.parse(input);

  const course = await createCourseDb(user.id, data);

  revalidatePath("/courses");
  return { success: true, data: course };
}
```

### Action Rules

- File starts with `"use server"`
- Validate input with Zod immediately
- Call `requireUser()` or `requireRole()` before any operation
- Delegate DB logic to `src/server/` modules
- Call `revalidatePath` or `revalidateTag` after mutations
- Return typed responses — never throw to the client for expected errors

## Server Modules

```typescript
// src/server/courses/create-course.ts
export async function createCourse(userId: string, data: CreateCourseInput): Promise<Course> {
  const membership = await requireOrgMembership(userId, data.organizationId);
  requireRole(membership, ["admin", "instructor"]);

  return db.course.create({ data: { ...data, organizationId: membership.organizationId } });
}
```

- No `"use server"` in server modules
- Pure async functions — testable independently
- Auth checks happen here, not just in actions

## Typed Responses

All server actions and API routes return typed shapes — no untyped JSON.

```typescript
// src/types/api.ts
type ActionSuccess<T> = { success: true; data: T };
type ActionError = { success: false; error: string; code: ErrorCode };

type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";
```

```typescript
// REST response types
type ApiSuccess<T> = { data: T; meta?: Record<string, unknown> };
type ApiError = { error: string; code: ErrorCode; details?: unknown };
```

Never return raw database models with sensitive fields. Map to response DTOs.

## Consistent Error Handling

Use the same error codes and shapes across server actions and REST routes.

| Code | HTTP Status | When |
|------|-------------|------|
| `UNAUTHORIZED` | 401 | No valid session |
| `FORBIDDEN` | 403 | Authenticated but wrong role |
| `NOT_FOUND` | 404 | Resource does not exist |
| `VALIDATION_ERROR` | 400 | Zod validation failed |
| `CONFLICT` | 409 | Duplicate or state conflict |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

```typescript
// ❌ BAD — inconsistent, leaks internals
return Response.json({ message: error.stack }, { status: 500 });

// ✅ GOOD — typed, safe
return Response.json(
  { error: "Unable to process request", code: "INTERNAL_ERROR" },
  { status: 500 }
);
```

- Never expose stack traces in production
- Log full errors server-side; return safe messages to clients
- Validation errors include field-level details when applicable

## REST API Routes

Location: `src/app/api/v1/`

Use only when Server Actions are not suitable:

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/v1/health` | GET | None | Health check |
| `/api/v1/webhooks/payfast` | POST | ITN signature | Platform subscriptions only |
| `/api/v1/webhooks/paypal` | POST | Signature | Student→teacher booking payment |

### RESTful Conventions

```
GET    /api/v1/courses          → list
GET    /api/v1/courses/:id      → get one
POST   /api/v1/courses          → create
PATCH  /api/v1/courses/:id      → update
DELETE /api/v1/courses/:id      → delete
```

- Use nouns for resources, HTTP verbs for actions
- Use plural resource names
- Return appropriate status codes — not always 200
- Version via URL prefix (`/api/v1/`)

```typescript
// src/app/api/v1/webhooks/payfast/route.ts
export async function POST(request: Request) {
  const body = await request.text();
  // Verify PayFast ITN signature with passphrase — see docs/PayFast.md
}
```

## Authentication

Authentication required on all routes except public endpoints (health check, webhooks with signature verification).

- **Server Actions** — session via `requireUser()` / `requireRole()`
- **REST routes** — session cookie or Bearer token; webhooks use signature verification
- Never skip auth because the route is "internal" — all write operations require a session

## Rate Limiting

Apply rate limits to all API routes and sensitive server actions:

| Endpoint type | Limit |
|---------------|-------|
| Auth endpoints | 10 req/min per IP |
| File uploads | 20 req/hour per user |
| General API | 100 req/min per user |
| Webhooks | Signature verification — no session limit |

Return `429` with `RATE_LIMITED` code and `Retry-After` header when exceeded.

## Logging

Log all API activity server-side:

```typescript
// What to log
console.info("[API] POST /api/v1/courses", { userId, organizationId, status: 201 });
console.error("[API] createCourse failed", { userId, error: error.message });
```

| Event | Level | Include |
|-------|-------|---------|
| Request handled | info | method, path, userId, status |
| Auth failure | warn | IP, path, reason |
| Validation error | warn | path, fields |
| Unexpected error | error | path, userId, error message |
| Rate limit hit | warn | IP or userId, path |

**Never log:** passwords, tokens, full request bodies with PII, stack traces in production responses.

## Validation

- Zod schemas in `src/lib/validations/[feature].ts`
- Export schema and inferred type together

```typescript
export const CreateCourseSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  organizationId: z.string().uuid(),
});
export type CreateCourseInput = z.infer<typeof CreateCourseSchema>;
```

## File Naming

```
src/actions/courses.ts              → createCourse, updateCourse, deleteCourse
src/server/courses/
  create-course.ts
  get-courses-for-user.ts
  update-course.ts
src/lib/validations/course.ts       → Zod schemas
src/types/api.ts                    → ActionSuccess, ActionError, ErrorCode
src/app/api/v1/webhooks/payfast/route.ts
src/app/api/v1/webhooks/paypal/route.ts
```

## Do Not

- Do not create REST endpoints for operations Server Actions can handle
- Do not put business logic directly in server actions — delegate to server modules
- Do not expose internal IDs, stack traces, or sensitive fields in responses
- Do not skip Zod validation because "the form already validates"
- Do not skip auth, rate limiting, or logging on new API routes

---

## Related Rules

- `rules.md` — Master project rules
- `coding-standards.md` — TypeScript, Zod, TanStack Query
- `security.md` — Auth, RBAC, rate limits, secrets
- `database.md` — Prisma queries, org-scoped access
