# Security Rules

## Core Principles

Always validate inputs.

Never trust client data.

Use middleware.

Sanitize uploads.

Protect admin routes.

Protect teacher routes.

Protect student routes.

Rate limit APIs.

Encrypt sensitive data.

Store secrets in environment variables.

---

## Authentication

- Supabase Auth handles all identity — do not build custom auth
- Session read server-side only via Supabase server client
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client

```typescript
// ❌ BAD — service role in client component
"use client";
const supabase = createClient(url, SERVICE_ROLE_KEY);

// ✅ GOOD — server-side session check
const supabase = createServerClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) throw new UnauthorizedError();
```

## Middleware

Use `src/middleware.ts` as the first line of defense:

- Validate Supabase session on every protected route
- Redirect unauthenticated users to `/login`
- Block role-restricted routes before they reach the page

```typescript
// src/middleware.ts — protect route prefixes by role
const adminRoutes = ["/admin"];
const instructorRoutes = ["/availability", "/settings/payments"];
const studentRoutes = ["/bookings", "/teachers"];
```

Middleware handles auth presence. Server actions and server modules handle fine-grained authorization.

## Never Trust Client Data

- Treat all client input as untrusted — validate server-side with Zod on every write
- Never trust client-provided `userId`, `organizationId`, or `role` — derive from session
- Never trust client-provided file metadata — inspect files server-side
- Never trust hidden form fields or URL params for authorization decisions

```typescript
// ❌ BAD — trusting client org ID
export async function createCourse(data: { organizationId: string; title: string }) {
  return db.course.create({ data });
}

// ✅ GOOD — org derived from authenticated membership
export async function createCourse(userId: string, data: CreateCourseInput) {
  const membership = await requireOrgMembership(userId, data.organizationId);
  requireRole(membership, ["admin", "instructor"]);
  return db.course.create({ data: { ...data, organizationId: membership.organizationId } });
}
```

## Route Protection by Role

Roles: `platform admin` (global), `admin`, `instructor`, `student` (per organization).

### Platform Admin Routes

| Route | Allowed |
|-------|---------|
| `/admin/*` | platform admin (`isPlatformAdmin`) only |

### Organization Admin Routes

| Route | Allowed roles |
|-------|---------------|
| `/settings/billing` | org admin |
| `/settings/members` | org admin |

### Teacher Routes

| Route | Allowed roles |
|-------|---------------|
| `/settings/payments` | admin, instructor |
| `/settings/profile` | admin, instructor |
| `/availability` | admin, instructor |
| `/sessions/[id]` (host) | admin, instructor |

### Student Routes

| Route | Allowed roles |
|-------|---------------|
| `/teachers` (browse/book) | all; book action: student |
| `/bookings` | student, instructor |
| `/sessions/[id]` (join) | student, instructor |

Every protected server action and server module must:

1. Verify the user is authenticated
2. Verify the user belongs to the relevant organization (if org-scoped)
3. Verify the user's role permits the operation

```typescript
export async function updateAvailability(userId: string, data: AvailabilityInput) {
  const membership = await requireOrgMembership(userId, data.organizationId);
  requireRole(membership, ["admin", "instructor"]);
  // ... proceed
}
```

## Input Validation

- Validate all inputs with Zod before any database write or file operation
- Schemas in `src/lib/validations/` — shared between forms and server actions
- Reject invalid input early — return typed errors, never proceed with bad data
- Never construct raw SQL — use Prisma parameterized queries only

## Sanitize Uploads

Validate server-side before storing in Supabase Storage:

| Type | Max Size | Allowed MIME types |
|------|----------|--------------------|
| Avatar | 2 MB | `image/jpeg`, `image/png`, `image/webp` |
| Course cover | 5 MB | `image/jpeg`, `image/png`, `image/webp` |
| Assignment | 25 MB | `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/zip` |

- Verify MIME type server-side — do not trust file extension or client-reported type
- Generate storage paths server-side — never use client-provided paths
- Scan file size before accepting upload
- Store files in org-scoped buckets with access policies

## Rate Limiting

Rate limit all API routes and sensitive server actions:

| Endpoint type | Limit |
|---------------|-------|
| Auth (login, register, reset) | 10 req/min per IP |
| File uploads | 20 req/hour per user |
| General API / server actions | 100 req/min per user |
| Webhooks | Signature verification only — no session rate limit |

Return `429 Too Many Requests` with a retry hint when limits are exceeded.

## Encrypt Sensitive Data

- TLS 1.2+ enforced on all connections in production
- PostgreSQL encryption at rest via Supabase
- Passwords hashed by Supabase Auth — never stored in app database
- Payment data: PayFast handles subscriptions and ZAR sessions; PayPal handles global session payments — platform never stores card numbers
- Sensitive fields at rest encrypted where required (tokens, API keys stored per-org)

## Secrets

Store secrets in environment variables only — never in code or git.

| Variable | Client-safe? |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | **Never** |
| `DATABASE_URL` | **Never** |
| `PAYFAST_MERCHANT_KEY` | **Never** |
| `PAYFAST_PASSPHRASE` | **Never** |
| `PAYPAL_CLIENT_SECRET` | **Never** |
| `LIVEKIT_API_KEY` | **Never** |
| `LIVEKIT_API_SECRET` | **Never** |

- `.env.local` is gitignored
- Commit `.env.example` with placeholder values only
- Production secrets managed via Vercel environment variables

## Data Access

- Scope ALL queries to the user's organization
- Students can only access courses they are enrolled in
- Instructors can only manage courses in their organization
- Never return another user's grades, submissions, or personal data

## Output Safety

- Do not include stack traces in production error responses
- Do not log passwords, tokens, or PII
- React escapes JSX by default — never use `dangerouslySetInnerHTML`

## Checklist for New Features

- [ ] Route protected in middleware
- [ ] Role check matches admin / instructor / student requirements
- [ ] Server action validates input with Zod
- [ ] Org and user derived from session — not client payload
- [ ] Query scoped to organization
- [ ] Uploads sanitized server-side (if applicable)
- [ ] Rate limit applied (if API route)
- [ ] No secrets in client bundle
- [ ] RLS policy added for new Supabase tables

---

## Related Rules

- `rules.md` — Master project rules
- `coding-standards.md` — TypeScript, Zod validation, folder structure
- `database.md` — Prisma schema, soft deletes, org-scoped queries
- `api.md` — Server actions, error responses, rate limits
