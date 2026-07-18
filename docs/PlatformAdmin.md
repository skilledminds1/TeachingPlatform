# Platform Admin

## Overview

Platform admins are **SkilledMinds staff** who manage marketplace quality — not to be confused with **organization admins** who manage a single workspace.

---

## Provisioning

**Recommended approach:** `User.isPlatformAdmin = true` in the database.

- Set via `prisma/seed.ts` for development
- Set manually in production for SkilledMinds staff emails
- **No self-registration** as platform admin
- **No separate auth system** — same Supabase login, flag checked server-side

```typescript
// src/server/auth/require-platform-admin.ts
export async function requirePlatformAdmin(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user?.isPlatformAdmin) throw new ForbiddenError();
  return user;
}
```

---

## Routes

All platform admin routes under `/admin/*` with dedicated layout.

| Route | Purpose |
|-------|---------|
| `/admin` | Dashboard — stats overview |
| `/admin/teachers` | Profile approval queue |
| `/admin/teachers/[id]` | Review and approve/reject profile |
| `/admin/reviews` | Review moderation queue |
| `/admin/reviews/[id]` | Approve/reject review |
| `/admin/analytics` | Platform MRR, bookings, active teachers |
| `/admin/audit-log` | Admin action history |

Middleware: require authenticated session + `isPlatformAdmin`.

Organization admins **cannot** access `/admin/*`.

---

## Profile Approval Queue

### Workflow

1. Teacher submits profile (status → `pending_approval`)
2. Profile appears in `/admin/teachers?status=pending`
3. Admin reviews: bio, photo, subjects, rate, payment account linked
4. **Approve** → status `approved`; profile live on marketplace
5. **Reject** → status `rejected`; `rejectionReason` sent to teacher via notification

### SLA

48 business hours — track `submittedAt` on TeacherProfile.

### Audit

Every approve/reject logged to `AdminAuditLog`.

---

## Review Moderation

1. Student submits review after completed booking
2. Review status → `pending`
3. Admin moderates at `/admin/reviews`
4. Approve → public on teacher profile
5. Reject → hidden; no notification to student for spam/abuse

Teachers may post one public response per approved review.

---

## Permissions

| Action | Platform Admin | Org Admin |
|--------|:-:|:-:|
| Approve teacher profiles | ✓ | |
| Moderate reviews | ✓ | |
| View platform MRR | ✓ | |
| View all org private data | ✗ | |
| Manage org members | | ✓ |
| Manage org PayFast billing | | ✓ |

Platform admins must not browse org course content or private messages without documented audit reason.

---

## UI

- Separate layout: `src/app/admin/layout.tsx`
- Dark mode first, same design system as main app
- Approval queues use table + detail panel pattern
- Bulk actions deferred to post-v1

---

## Security

- `isPlatformAdmin` never accepted from client input
- All admin server actions call `requirePlatformAdmin()`
- Admin routes in middleware block list
- Rate limit admin endpoints
- All actions in audit log
