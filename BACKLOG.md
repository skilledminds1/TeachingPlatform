# Amazing Skills — Implementation Backlog

> Generated from a two-pass codebase audit (159 findings, 8 adversarially verified) plus a
> payments and classroom architecture review. Supersedes the payment advice in earlier drafts.
> `TODO.md` remains the record of which product features are built; **this file is the work plan.**

## The architecture this backlog builds toward

Three physically separate money rails. No shared provider account, no shared code path.
The moment lesson money routes through the course or subscription provider "for convenience,"
the platform becomes a payment facilitator and the whole model collapses.

| | Live lessons | Courses | Teacher subscriptions |
|---|---|---|---|
| **Seller of record** | The teacher | Amazing Skills (as publisher) | Merchant of record |
| **Who touches the money** | Teacher only | MoR, split to teacher + platform | MoR, then platform |
| **Platform cut** | **0%** | **10%** | 100% (own revenue) |
| **Tax at checkout** | Teacher's Stripe Tax | MoR's liability | MoR's liability |
| **Provider** | Teacher's own Stripe (BYOK restricted key) | FastSpring (to confirm) | Paddle or Polar.sh (to confirm) |

**Why lessons can stay zero-touch but courses cannot.** A pre-recorded course is an
*electronically supplied service*. Under EU Implementing Regulation 282/2011 Article 9a and the
identical HMRC test, a platform is presumed to be the supplier unless it does none of three
things: authorise the charge, authorise delivery, or set the general terms. Hosting and gating
the course video *is* authorising delivery. So the platform is the deemed supplier in the EU and
UK **whether or not it takes a cent** — meaning the compliance cost arrives with the course
product itself, not with the commission. Declining the 10% buys nothing. Live 1:1 tuition is
human-delivered, is not an electronically supplied service, and Article 9a does not reach it.

## Send these five emails before writing P2 code

They cost nothing and they gate weeks of work. Do not delay P0/P1 while waiting.

1. **Stripe support** — is systematic collection of merchants' restricted API keys at marketplace
   scale acceptable under the Services Agreement? *A "no" invalidates the entire lesson architecture.*
   Highest-stakes unknown in this plan.
2. **Paddle and Polar compliance** (both, same day) — will you onboard a tutoring marketplace that
   bills only its own SaaS subscription, with no student funds flowing through you? Paddle demands
   three months of processing statements and has documented rejections of pre-revenue businesses.
3. **FastSpring** — will you underwrite an education publisher reselling licensed third-party
   courses; can split partners scale without a support ticket each; SA seller rate card?
4. **Tazapay** — the one split-settlement provider with a plausible path to yes for an SA platform.
   If yes, it is strictly better than the split-rail design.
5. **LiveKit** — media-edge PoP list for Africa and South America.

---

## P0 — Security holes that are exploitable today

Market-independent. Nothing here depends on a payment decision. Start immediately.

<sub>17 tasks · 2 critical · 7 high · 5 medium · 3 low</sub>

### 🔴 `SEC-01` Enable RLS and revoke anon/authenticated privileges on every application table

- [x] **Effort:** M · 1–2 days · **Area:** database-security
- **Files:** `prisma/schema.prisma`, `supabase/migrations/20260719234500_storage_hardening.sql`, `src/lib/supabase/client.ts`, `prisma/migrations/migration_lock.toml`
- **What:** No ALTER TABLE ... ENABLE ROW LEVEL SECURITY exists anywhere in prisma/migrations; the only non-Prisma SQL touches storage.buckets/storage.objects only. Meanwhile the Supabase publishable/anon key ships to the browser by design and Supabase exposes the public schema through PostgREST. Add a checked-in migration doing ENABLE + FORCE ROW LEVEL SECURITY on every Prisma-managed table, REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated, and ALTER DEFAULT PRIVILEGES ... REVOKE. All app access goes through Prisma on the direct Postgres connection as table owner, so a deny-all posture costs the app nothing. Alternative: move Prisma tables to a non-exposed schema.
- **Done when:** With only NEXT_PUBLIC_SUPABASE_URL and the publishable key, PostgREST requests to /rest/v1/users, /rest/v1/bookings, /rest/v1/calendar_connections and /rest/v1/teacher_payment_accounts return 401 or empty; a full booking + checkout flow and the test suite still pass.

### 🔴 `SEC-02` CSRF state and server-side merchant verification on the PayPal linking callback

- [x] **Effort:** M · 1–2 days · **Area:** payments-security
- **Files:** `src/app/api/v1/payments/paypal/callback/route.ts`, `src/actions/payment-linking.ts`, `src/services/paypal/checkout.ts`, `src/server/teachers/payments.ts`
- **What:** The partner-referral branch (GET, lines 14-48) fires on the mere presence of attacker-controlled tracking_id/merchantId/merchant_id, is guarded only by requireTeacher(), and writes providerAccountId: merchantId with onboardingStatus 'complete' and capabilities ['payments','refunds']. The signed paypal_connect_state cookie is only read further down at line 54 and is never reached. Auth cookies are SameSite=Lax so a top-level GET navigation carries them: one click on a crafted link repoints a teacher's payout destination. Require the signed state cookie on BOTH branches, compare the query tracking_id against the stored metadata.trackingId, verify the merchant server-side via PayPal's merchant-integrations lookup, and read merchantIdInPayPal rather than merchantId (which is only an echo of the platform's own tracking id, so today a real onboarding stores 'teacher_xxxx_hex' as the merchant id and every live checkout for that teacher would fail). Treat a payout-destination change as sensitive: email the teacher and write an audit row. Keep this fix regardless of PAY-13 — the route is live today.
- **Done when:** GET /api/v1/payments/paypal/callback?merchantId=ATTACKER while authenticated as a teacher performs no DB write and redirects to an error; a legitimate sandbox onboarding stores the real 13-character PayPal merchant id and produces an audit-log row plus a notification email.

### 🟠 `SEC-03` Bind Google Calendar OAuth state to a nonce cookie and reject stateless callbacks

- [x] **Effort:** S · <½ day · **Area:** oauth-security
- **Files:** `src/app/api/integrations/google-calendar/connect/route.ts`, `src/app/api/integrations/google-calendar/callback/route.ts`, `src/server/integrations/google-calendar.ts`
- **What:** State is unsigned base64url JSON with no nonce and no cookie binding, and the callback check is `if (expectedUserId && expectedUserId !== user.id)` — a callback with no state (or malformed state, silently swallowed by the catch) skips validation entirely and the code is exchanged and bound to whoever's session cookie is attached. An attacker completes their own Google consent, captures the code, and gets a logged-in teacher to open the callback URL, linking the victim's account to the attacker's calendar. Mint a random nonce into an httpOnly SameSite=Lax short-lived cookie at /connect (the pattern src/actions/payment-linking.ts already uses correctly), put only the nonce in state, and in the callback require state + cookie, compare in constant time, delete the cookie, and reject when anything is missing.
- **Done when:** Callbacks with absent, malformed, or non-matching state create no CalendarConnection and return an error; the normal connect flow still succeeds end to end.

### 🟠 `SEC-04` Fix the open redirect present in all five auth/return flows

- [x] **Effort:** S · <½ day · **Area:** auth-security
- **Files:** `src/actions/auth.ts`, `src/app/auth/callback/route.ts`, `src/middleware.ts`, `src/actions/legal.ts`, `src/app/api/integrations/google-calendar/connect/route.ts`
- **What:** Five copy-pasted guards use `path.startsWith('/') && !path.startsWith('//')` and then hand the value to new URL(path, origin) or router.push(path). The WHATWG URL parser treats a backslash as a slash for special schemes, so `/\evil.com` resolves to https://evil.com/ and defeats the guard. Replace all five with one shared helper that parses against the app origin and returns pathname+search only when u.origin === appOrigin, and prefer an allowlist of internal path prefixes (/dashboard, /admin, /courses, ...).
- **Done when:** A unit test proves `/\evil.com`, `//evil.com`, `https://evil.com`, `/\/evil.com` and `\\evil.com` are rejected at each of the five call sites while legitimate /dashboard returnTo values still work.

### 🟠 `SEC-05` Enforce platform-admin authorization in admin data loaders, not only the layout

- [x] **Effort:** M · 1–2 days · **Area:** admin-security
- **Files:** `src/middleware.ts`, `src/app/admin/layout.tsx`, `src/app/admin/trust/page.tsx`, `src/server/admin/dashboard.ts`, `src/server/admin/subscriptions.ts`, `src/server/courses/queries.ts`
- **What:** middleware.ts only verifies that some user is signed in for /admin/*, never isPlatformAdmin; the sole authorization gate is requirePlatformAdmin() in the admin layout component. src/app/admin/trust/page.tsx queries moderationCase and safetyReport (including reporter emails) with no auth call at all, and getAdminDashboardData, getTeacherModerationQueue, getAdminOrganizations, getAdminUsers, getAdminAuditLogs, getCourseModerationQueue and getCourseForAdminReview contain no authorization check. Call requirePlatformAdmin() as the first statement of every function in src/server/admin/* and inline it at the top of each admin page that queries db directly; keep the layout check for UX but treat the loader as the security boundary. Add an isPlatformAdmin check in middleware for defence in depth.
- **Done when:** A non-admin authenticated session invoking each admin loader (directly or via an RSC payload) receives a forbidden error; a test asserts every export in src/server/admin/* calls requirePlatformAdmin before touching db.

### 🟠 `SEC-06` getNotificationPreferences is an unauthenticated server action exposing any user's row

- [x] **Effort:** S · <½ day · **Area:** server-actions
- **Files:** `src/actions/notification-preferences.ts`, `src/app/dashboard/settings/page.tsx`, `src/app/dashboard/teacher/settings/page.tsx`
- **What:** The file opens with 'use server', which makes every export a publicly callable RPC endpoint. getNotificationPreferences(userId) takes a caller-supplied id with no requireAuth, no Zod validation and no ownership check, then returns that user's userNotificationPreference row. It is only intended as a server-side helper. Move it into src/server/notifications/ (a plain module, not a 'use server' file) and import it from the two pages, or drop the parameter and derive the id from requireAuth().
- **Done when:** Invoking the action id with an arbitrary uuid returns unauthorized or 404; both settings pages still render preferences. A lint rule or test asserts every export in src/actions/*.ts calls a require* helper before touching db.

### 🟠 `SEC-07` Make distributed rate limiting mandatory in production

- [x] **Effort:** M · 1–2 days · **Area:** abuse-prevention
- **Files:** `src/lib/security/rate-limit.ts`, `src/lib/env.ts`, `.env.example`, `docs/Deployment.md`
- **What:** checkRateLimit falls back to a module-level Map whenever the Upstash env vars are absent and on any Redis error; both vars are optional and .env.example plus docs/Deployment.md label distributed limiting 'optional'. On serverless each instance holds its own Map and cold starts reset it, so the sign-in (10/15min), sign-up, password-reset and password-change caps are effectively unenforced. Require a shared store in production (or implement a Postgres counter table), fail closed for auth-sensitive actions when the store is unavailable, key auth limits on the submitted email as well as the IP, and take the client IP from the platform-verified header or the rightmost trusted XFF hop rather than the attacker-controlled leftmost one.
- **Done when:** With Upstash unset in production the app fails to boot or auth actions return a rate-limit-unavailable error; 11 sign-in attempts spread across two instances are blocked by the shared counter; the docs no longer call it optional.

### 🟠 `SEC-08` Restrict lesson videoUrl to an https embed-host allowlist and unblock legitimate embeds

- [x] **Effort:** S · <½ day · **Area:** xss
- **Files:** `src/lib/validations/courses.ts`, `src/features/courses/components/curriculum-preview.tsx`, `src/features/courses/components/enrolled-course-viewer.tsx`, `next.config.ts`
- **What:** createLessonSchema.videoUrl is z.url() with no scheme or host restriction, and zod 4.4.3 accepts javascript: and data: URLs. The value is injected unfiltered as an iframe src in the enrolled viewer and — critically — on the unauthenticated public sales page for preview lessons, while script-src still allows 'unsafe-inline'. Replace with a refinement requiring https: plus an allowlisted embed host (youtube-nocookie.com, player.vimeo.com, loom.com), normalise pasted watch URLs into embed URLs, and add those hosts to frame-src in next.config.ts, which currently blocks every legitimate embed host so the feature does not even render.
- **Done when:** javascript:, data: and http: video URLs are rejected with a clear message; a pasted YouTube watch URL renders correctly in both the public preview and the enrolled viewer.

### 🟠 `SEC-15` PayFast ITN: verify the paid amount, compare signatures in constant time, check the source

- [x] **Effort:** S · <½ day · **Area:** webhooks
- **Files:** `src/app/api/v1/webhooks/payfast/route.ts`, `src/actions/billing.ts`, `src/lib/security/cron-auth.ts`
- **What:** handleSubscriptionItn verifies the signature and does the server-to-server validate call (both sound), then on payment_status COMPLETE activates whatever planId custom_str2 names for a full period and only records amount_gross into the invoice afterwards. It never compares the amount against the plan/interval price, nor against the custom_str4 USD cents that checkout embedded, and the signature is compared with ===. PayFast's own integration guide lists four mandatory checks; two are missing. Recompute the expected amount for (planId, interval), reject or flag deviations beyond a rounding tolerance with a validation_failed billing event, switch to the existing constantTimeEqual helper, and add a PayFast source-host allowlist check.
- **Done when:** A validly signed ITN naming a Business planId with a Starter amount does not activate Business and logs validation_failed; legitimate ITNs continue to activate normally.

### 🟡 `SEC-09` Validate lesson file uploads with a MIME allowlist and magic-byte check

- [x] **Effort:** S · <½ day · **Area:** uploads
- **Files:** `src/actions/courses.ts`, `src/lib/validations/courses.ts`, `src/server/courses/media.ts`
- **What:** uploadLessonFile validates only that size is > 0 and <= 80 MB and stores whatever arrives with contentType from the client, while every other upload path (avatars, credentials, intro videos, course media) checks both the declared MIME type and the binary signature. A teacher or a compromised teacher account can upload .exe/.hta/.svg/.html payloads into the course-files bucket. Apply the courseResourceMimeTypes allowlist and hasValidCourseMediaSignature over the first bytes, set allowedMimeTypes on the bucket the way ensureCourseMediaBucket does, and fold the legacy path into createCourseMediaUpload/confirmCourseMediaUpload.
- **Done when:** An HTML or executable payload renamed to .pdf is rejected before upload; legitimate PDF and ZIP resources still upload and download.

### 🟡 `SEC-11` Encrypt Google OAuth tokens at rest and actually revoke on disconnect

- [x] **Effort:** M · 1–2 days · **Area:** secrets
- **Files:** `src/server/integrations/google-calendar.ts`, `prisma/schema.prisma`, `src/lib/env.ts`, `src/actions/google-calendar.ts`
- **What:** CalendarConnection.accessToken and refreshToken are plain String columns and upsertCalendarConnection writes Google's raw token response straight into them. A refresh token for the calendar.events scope grants durable read/write access to a teacher's personal calendar until manually revoked; any DB dump, read replica, leaked service-role key or Prisma Studio session exposes every one. The codebase already hashes invitation tokens, so the precedent exists. Encrypt with AES-256-GCM under a new TOKEN_ENCRYPTION_KEY, decrypt only inside the token getter, rotate existing rows on migration, and make deleteCalendarConnection call Google's /revoke endpoint so disconnect invalidates the grant rather than merely deleting the row.
- **Done when:** A database dump shows ciphertext for both token columns; connect, sync and disconnect all still work; disconnect returns a success response from Google's revoke endpoint.

### 🟡 `SEC-12` Replace CSP script-src 'unsafe-inline' with per-request nonces

- [x] **Effort:** M · 1–2 days · **Area:** csp
- **Files:** `next.config.ts`, `src/middleware.ts`, `src/app/layout.tsx`
- **What:** Production CSP sets script-src 'self' 'unsafe-inline' (only 'unsafe-eval' is dev-gated). The rest of the header set is genuinely strong — frame-ancestors 'none', object-src 'none', base-uri 'self', HSTS with preload, a scoped connect-src — but 'unsafe-inline' removes the main benefit on an app that renders up to 100 KB of user-authored course description plus review comments and case messages. Generate a nonce in middleware, thread it through the CSP header and Next's nonce support, and give next-themes' inline anti-flicker script the nonce.
- **Done when:** The production response header contains no 'unsafe-inline' in script-src, and there are zero CSP violations in the console across landing, find-tutor, course, checkout, dashboard and session pages.

### 🟡 `SEC-13` Audit-log admin reads of teacher ID documents and analytics exports

- [x] **Effort:** S · <½ day · **Area:** admin-security
- **Files:** `src/app/api/v1/storage/credentials/route.ts`, `src/app/api/v1/admin/analytics/export/route.ts`, `src/actions/admin.ts`, `src/app/admin/audit-log/page.tsx`
- **What:** PROJECT.md states the platform admin 'cannot access org-private data without audit reason' and that all admin actions are logged. Write actions honour this; reads do not. Any isPlatformAdmin user can mint a signed URL for any path in the private credentials bucket — teacher qualification and ID-style documents — and export platform-wide payment and revenue data, with no AdminAuditLog row and no reason captured. Write audit rows (credential.viewed, analytics.exported) with targetType/targetId inside each admin read path, require a short free-text reason for credential downloads stored in metadata, and surface these entries in /admin/audit-log.
- **Done when:** A credential download without a reason parameter is rejected; every admin read of private data produces a visible entry in the audit-log view.

### 🟡 `SEC-17` Put the storage/RLS hardening SQL into the automated deploy path

- [x] **Effort:** S · <½ day · **Area:** deployment-security
- **Files:** `supabase/migrations/20260719234500_storage_hardening.sql`, `supabase/README.md`, `package.json`, `docs/Deployment.md`, `src/app/api/v1/health/ready/route.ts`
- **What:** Schema changes flow through prisma/migrations (applied by prisma migrate), but the one migration that makes the credentials, course-media, course-files and case-evidence buckets private lives in supabase/migrations/ with a README instruction to apply it manually. No script, CI step or deploy hook runs it and the Supabase CLI is not wired into package.json, so any fresh environment — staging, a disaster-recovery restore, a second region — recreates the app schema with default (public) bucket policies. Fold it into a Prisma migration (it is plain SQL against the same Postgres) or add a supabase db push deploy step, and add a readiness check asserting public=false on the sensitive buckets.
- **Done when:** An environment provisioned only by the documented deploy commands has private credentials and case-evidence buckets; /api/v1/health/ready fails when any sensitive bucket is public.

### ⚪ `SEC-10` credentialUrl accepts javascript: and data: URLs and is rendered as an href

- [x] **Effort:** S · <½ day · **Area:** xss
- **Files:** `src/lib/validations/teacher-onboarding.ts`, `src/features/teacher-onboarding/components/credential-uploader.tsx`, `src/actions/teacher-onboarding.ts`
- **What:** teacherOnboardingSchema.qualifications[].credentialUrl is z.union([z.literal(''), z.url()]); z.url() accepts javascript:alert(1) and data:text/html. The value is persisted verbatim and rendered as an href in the credential uploader. Blast radius is self-only today because the admin moderation view does not link it — fix it before anyone adds that link. Constrain to https:, or better, accept only the app's own /api/v1/storage/credentials?path=... form that uploadTeacherCredential produces and reject arbitrary external URLs.
- **Done when:** javascript: and data: values fail schema validation; existing rows are backfilled or nulled; the admin review UI can safely link the field.

### ⚪ `SEC-14` Validate raw string ids in the server actions that skip Zod

- [x] **Effort:** S · <½ day · **Area:** server-actions
- **Files:** `src/actions/organization-invites.ts`, `src/actions/availability.ts`, `src/actions/messaging.ts`
- **What:** revokeOrganizationInvite(invitationId), deleteAvailabilityException(id), startConversationWithTeacher/startConversationWithStudent(userId) and acceptOrganizationInvite(token) pass unvalidated strings straight into Prisma uuid columns, raising P2023 500s and noisy logs. Authorization is still correct in each case so this is not an IDOR, but revokeOrganizationInvite also queries the invitation before authorizing, so an unauthenticated shape probe learns whether an id exists. Wrap each with the z.uuid().safeParse guard used elsewhere and reorder the revoke path to authorize first.
- **Done when:** Each action returns VALIDATION_ERROR for a non-uuid input; revokeOrganizationInvite performs its authorization check before its first db read.

### ⚪ `SEC-16` Stop transmitting the PayFast API passphrase as an HTTP header

- [x] **Effort:** S · <½ day · **Area:** secrets
- **Files:** `src/services/payfast/subscriptions.ts`
- **What:** buildSignedHeaders and updatePayfastSubscription put `passphrase` into the same object used both to generate the signature and as the outgoing request headers to api.payfast.co.za. PayFast's spec uses the passphrase only as signature salt; it should never be transmitted, where it can land in proxy/edge logs and PayFast-side request logging, and an unexpected header can itself cause signature rejections. Build the signature payload from a separate map and send only merchant-id, version, timestamp and signature as headers.
- **Done when:** Outbound request headers contain no passphrase; subscription update and cancel calls still succeed against sandbox.

---

## P1 — Money bugs in the code that exists now

These are live defects in the current PayPal + PayFast paths. Fix them even though both rails are being replaced: the code is running today, and the state-machine fixes carry straight over to the new providers.

<sub>36 tasks · 5 critical · 13 high · 16 medium · 2 low</sub>

### 🔴 `MON-01` Guard PayPal capture on attempt and booking state to stop double charges

- [x] **Effort:** M · 1–2 days · **Area:** lesson-payments
- **Files:** `src/app/api/v1/payments/paypal/complete/route.ts`, `src/server/payments/confirm.ts`, `src/actions/payments.ts`
- **What:** The only state check before capturing money is `if (attempt.status === 'succeeded')`. Attempts in expired, failed, pending or requires_action all fall through and any APPROVED order is captured, and confirmBookingPayment itself never checks booking.status. startLessonCheckout mints a new PaymentAttempt and PayPal order per minute and old approved orders are never voided when a sibling succeeds, so a student who opened checkout twice can approve both and be charged twice; a cancelled booking can still be charged. Require attempt.status in {pending, requires_action}, attempt.expiresAt > now, and the parent booking/purchase still pending_payment/pending before calling capturePayPalOrder; otherwise redirect with an expired message without capturing. Void or mark non-capturable the sibling orders when one attempt succeeds or the booking is cancelled/expired.
- **Done when:** Returning to the complete route for an expired attempt or a cancelled booking takes no money and shows an expired message; approving two orders for the same booking results in exactly one capture.

### 🔴 `MON-02` confirmBookingPayment must not resurrect cancelled or expired bookings

- [x] **Effort:** M · 1–2 days · **Area:** lesson-payments
- **Files:** `src/server/payments/confirm.ts`
- **What:** The booking update at ~123-131 sets status 'confirmed' unconditionally; the only short-circuit (line 99) requires the booking to already be confirmed. Sequence: booking A expires and the slot is freed (collision checks only consider pending_payment/confirmed), student B books and pays the same slot, then the late capture/return/webhook for A flips it from cancelled back to confirmed — the teacher now has two confirmed paid bookings for one slot and one student must be refunded manually through a provider the platform does not control. Refuse to confirm when booking.status is not pending_payment: record the event, mark the attempt succeeded, and auto-open a RefundRequest flagged for teacher and admin. If revival is ever permitted, re-run the slot-collision check inside the same transaction.
- **Done when:** Confirming a payment whose booking is cancelled leaves it cancelled, creates a refund request, and never yields two confirmed bookings for one teacher slot; covered by a regression test.

### 🔴 `MON-04` PayPal webhook parses capture events with order-shaped fields, so confirm and deny are dead code

- [x] **Effort:** M · 1–2 days · **Area:** webhooks
- **Files:** `src/app/api/v1/webhooks/paypal/route.ts`, `src/services/paypal/checkout.ts`
- **What:** PAYMENT.CAPTURE.COMPLETED delivers a capture-shaped resource (custom_id, supplementary_data.related_ids.order_id) with no purchase_units, but attemptId and teacherMerchantId are read from event.resource.purchase_units[0], so the guard at line 69 always skips confirmation. CHECKOUT.ORDER.APPROVED is an order but has no capture yet so capture?.id is undefined and it is skipped too. PAYMENT.CAPTURE.DENIED has the same bug, so denials are never recorded. Signature verification is done correctly, but the entire confirm/deny section is inert and the browser redirect is the only real confirmation path — meaning course purchases are never confirmed or reversed by webhook. Resolve the attempt from resource.custom_id or resource.supplementary_data.related_ids.order_id against providerCheckoutId, exactly as the REFUNDED handler at line 109 already does.
- **Done when:** Replaying real sandbox CAPTURE.COMPLETED, CAPTURE.DENIED and ORDER.APPROVED payloads through the route confirms, denies and captures respectively; the fixture payloads are committed as integration tests.

### 🔴 `MON-12` Recurring PayFast ITNs silently revert later plan changes

- [x] **Effort:** M · 1–2 days · **Area:** subscriptions
- **Files:** `src/app/api/v1/webhooks/payfast/route.ts`, `src/actions/billing.ts`, `src/server/billing/run-lifecycle.ts`
- **What:** Every COMPLETE ITN applies planId: custom_str2 and billingInterval: custom_str3, but PayFast echoes the ORIGINAL checkout custom fields on every recurring charge for the life of the token, while the app changes plans in place on that same token (updatePayfastSubscription for upgrades, run-lifecycle for scheduled downgrades) altering only amount and frequency. So a teacher upgraded Starter to Business is charged the Business amount and then reset to Starter by the renewal ITN, and every scheduled downgrade is reverted at the next renewal. The org query does not even select payfastToken, so there is no first-activation branch. Take plan and interval from custom fields only on the first activation of a token; on renewals keep the org's current plan and interval and only extend the period, and reconcile amount_gross against the current plan price.
- **Done when:** An upgrade followed by a renewal ITN leaves the org on the upgraded plan; a cron-applied scheduled downgrade survives the next renewal ITN; both cases covered by tests.

### 🔴 `MON-13` CANCELLED ITN strands the org on a paid plan forever

- [x] **Effort:** S · <½ day · **Area:** subscriptions
- **Files:** `src/app/api/v1/webhooks/payfast/route.ts`, `src/server/billing/run-lifecycle.ts`, `src/services/payfast/subscriptions.ts`
- **What:** When PayFast sends payment_status=CANCELLED the webhook sets only cancelAtPeriodEnd: true and keeps payfastToken. At period end the lifecycle cron requires cancelPayfastSubscription(token) to succeed before downgrading, but the subscription is already cancelled at PayFast so the call returns an error, providerCancelled is false, failures increments and the branch is skipped — every night, forever. The org keeps paid entitlements indefinitely without ever being charged again: direct recurring revenue loss and unbounded free access. Null the payfastToken on a CANCELLED ITN so the `!payfastToken ||` short-circuit applies the downgrade, and make cancelPayfastSubscription treat an 'already cancelled' response as success.
- **Done when:** After a CANCELLED ITN the next lifecycle run downgrades the org at period end; a regression test covers the already-cancelled provider response.

### 🟠 `MON-03` Make expiry-job state transitions conditional in both the booking and course branches

- [x] **Effort:** S · <½ day · **Area:** lesson-payments
- **Files:** `src/server/payments/confirm.ts`, `src/actions/payments.ts`
- **What:** expireAbandonedPayments selects candidate ids and then updates by id with no status predicate, so a confirmation landing between the select and the update flips a paid, confirmed booking to cancelled with reason 'Payment window expired' while the succeeded attempt survives — money captured, lesson cancelled. The course branch is worse: it sets the purchase to cancelled and deletes the coupon redemption while confirmCoursePayment may already have granted an enrollment that is never revoked, leaving the student silently enrolled against a cancelled purchase. Use updateMany with `status: 'pending_payment'` / `status: 'pending'` in the WHERE clause and skip the rest of the transaction when zero rows are affected. Together with MON-02 this closes the race in both directions.
- **Done when:** A test that confirms a booking and a course purchase between the select and the update leaves both confirmed, the enrollment intact, and the coupon redemption untouched.

### 🟠 `MON-05` Add a server-side capture fallback and a session-tolerant return route

- [x] **Effort:** M · 1–2 days · **Area:** lesson-payments · **Blocked by:** MON-04
- **Files:** `src/app/api/v1/payments/paypal/complete/route.ts`, `src/app/api/v1/webhooks/paypal/route.ts`, `src/server/payments/confirm.ts`
- **What:** Capture only ever happens inside the authenticated GET return route, where requireAuth() throws UnauthorizedError for anonymous requests. If the buyer approves inside PayPal's in-app webview where the session cookie is absent, closes the tab after clicking Pay Now, or their session expired, the order stays APPROVED forever, is never captured, and the booking silently expires while the student believes they paid. Capture server-side on CHECKOUT.ORDER.APPROVED after validating state, make the return route tolerate an anonymous session by looking up the attempt by order token and verifying state (or degrade to a 'finish signing in to complete payment' flow rather than throwing), and add a reconciliation job that queries PayPal for requires_action attempts before the expiry job cancels them.
- **Done when:** Closing the tab immediately after approving still results in a confirmed booking within one webhook delivery; an anonymous return no longer 401s; the reconciliation job recovers an orphaned APPROVED order.

### 🟠 `MON-09` Manual refunds: verify receipt, apply refund effects, and keep both ledgers in sync

- [x] **Effort:** M · 1–2 days · **Area:** refunds
- **Files:** `src/actions/refunds.ts`, `src/server/payments/confirm.ts`, `src/server/courses/certificates.ts`
- **What:** markRefundSent accepts any free-text providerReference of length >= 3 and immediately sets the request to refunded with providerRefundedCents = requestedAmountCents. Nothing verifies money moved; PaymentAttempt.refundedCents is never updated so the attempt still reads fully paid; CoursePurchase.status stays succeeded and CourseEnrollment.revokedAt stays null, so getEnrolledCourseDetail keeps serving every lesson video and signed asset indefinitely, and any issued certificate stays valid. The reversal logic exists but lives only in the webhook path (applyRefundToAttempt), which is backwards for a business model where manual refunds are the normal case. Extract a shared applyRefundEffects and call it from the manual path in one transaction; relabel the state as 'teacher reports refunded — awaiting your confirmation' with a student confirm/deny step, and keep escalation open until confirmed.
- **Done when:** A manual refund revokes the enrollment and certificate, sets the purchase refunded, updates PaymentAttempt.refundedCents, and stops serving course assets; the webhook and manual paths call the same shared function.

### 🟠 `MON-11` Post-payment side effects can be permanently lost after money is captured

- [x] **Effort:** M · 1–2 days · **Area:** lesson-payments
- **Files:** `src/server/payments/confirm.ts`, `src/server/video/sessions.ts`, `src/services/livekit/client.ts`
- **What:** ensureVideoSessionForBooking runs uncaught after the commit and throws when the plan lacks videoSessions, when the booking already started, or when LiveKit env vars are missing (createLiveKitRoom has no isLiveKitConfigured guard, unlike deleteLiveKitRoom). The throw skips notifyBookingConfirmed and the calendar sync, which run after it in the same .then. For deterministic failures every retry throws identically: the student has paid, the booking shows confirmed, and there is no room, no notification and no calendar event — permanently. Make it non-throwing for expected states (log and return null), run room creation, notifications and calendar sync independently via allSettled, raise a real alert (not just logger.warn) when a paid booking ends up with no VideoSession, and block checkout up front if a plan may not sell video lessons rather than failing after payment.
- **Done when:** With LiveKit env vars removed, a confirmed payment still notifies both parties and records the booking, and an alert is raised; no unhandled rejection and no webhook 500.

### 🟠 `MON-14` Scheduled plan change can set the recurring amount to zero

- [x] **Effort:** S · <½ day · **Area:** subscriptions
- **Files:** `src/server/billing/run-lifecycle.ts`, `src/services/payfast/subscriptions.ts`, `src/lib/env.ts`
- **What:** `amountCents: Math.round(usdCents * (env.PAYFAST_USD_ZAR_RATE ?? 0))` — the rate is optional in env validation. The interactive checkout path refuses to run without it, but the nightly cron has no such guard: with the var missing or blank every pending plan change calls updatePayfastSubscription with amount 0, either erroring silently every night so the change never applies, or, if accepted, setting the teacher's recurring charge to zero while granting the new plan. Remove the `?? 0`, fail the branch loudly with a counted failure and log line, and validate amountCents > 0 inside updatePayfastSubscription before calling the API.
- **Done when:** With the rate unset the lifecycle run logs a configuration failure and applies no plan change; no provider call is ever made with amount 0.

### 🟠 `MON-15` Past-due subscribers can clear grace and dunning without paying

- [x] **Effort:** S · <½ day · **Area:** subscriptions
- **Files:** `src/actions/billing.ts`, `src/server/billing/run-lifecycle.ts`
- **What:** When an org already has a payfastToken, createSubscriptionCheckout for any equal-or-higher-priced plan (the guard only blocks strictly cheaper plans) calls updatePayfastSubscription — which changes the future recurring amount but takes no payment — and then immediately sets subscriptionStatus 'active' and clears graceStartedAt, graceEndsAt and dunningStage. A teacher in past_due after a failed charge can simply re-select their own current plan and instantly exit the 7-day growth block and the 14-day grace window with no money moving, and each subsequent FAILED ITN restarts a fresh 14-day grace, so the cycle repeats indefinitely. Never clear grace/dunning or set active from the token-update path; only a verified COMPLETE ITN may clear past_due state.
- **Done when:** A past_due org re-selecting its plan stays past_due with grace timers intact; a subsequent successful ITN clears them.

### 🟠 `MON-16` No real payment-recovery path for past_due subscribers

> **Deferred:** Needs a real recovery flow (cancel the dead token, fresh signed checkout). Belongs with the P2 provider migration rather than being built twice.

- [ ] **Effort:** M · 1–2 days · **Area:** subscriptions
- **Files:** `src/actions/billing.ts`, `src/server/billing/run-lifecycle.ts`, `src/features/billing/components/billing-plan-selector.tsx`
- **What:** Dunning notices tell teachers to 'update or retry billing', but an org in past_due with a payfastToken has no way to pay: canStartFreshCheckout blocks a fresh checkout unless the current plan is free or complimentary, and the only available action is the token-update path which charges nothing. PayFast has no hosted card-update page, so a teacher whose card died cannot recover — the subscription is eventually cancelled at the provider (triggering MON-13) or the org hard-drops to read-only Free at day 14. This loses willing-to-pay subscribers. Add an explicit recovery flow that cancels the dead token and starts a fresh signed checkout for the same plan preserving period credit, and point the dunning CTA at it. Treat as an interim fix if PAY-04 lands first, since a provider with hosted card update supersedes it.
- **Done when:** A past_due teacher can complete a payment from the dunning email link and return to active in one flow, with the old token cancelled exactly once.

### 🟠 `MON-17` No watchdog for missed renewal or FAILED ITNs

- [x] **Effort:** S · <½ day · **Area:** subscriptions
- **Files:** `src/server/billing/run-lifecycle.ts`
- **What:** Grace only ever starts from a FAILED ITN. The lifecycle scan selects orgs by trialEndsAt, graceStartedAt, pendingChangeAt, cancelAtPeriodEnd or complimentaryExpiresAt — an active org whose currentPeriodEnd has passed with no COMPLETE ITN matches nothing and is never inspected. If PayFast does not send a FAILED ITN for a given failure mode, or delivery is lost during a deploy window, 5xx or validation outage (retries are finite), the teacher keeps paid entitlements indefinitely and the platform never notices. Add a branch for subscriptionStatus active + token not null + currentPeriodEnd older than a small buffer that starts the grace flow and alerts the founder, so billing state converges even when ITNs are missed.
- **Done when:** An org whose period end passed with no ITN enters grace on the next nightly run and generates an alert.

### 🟠 `MON-23` billing_date is computed in server UTC against a UTC+2 gateway, breaking checkout nightly

- [x] **Effort:** S · <½ day · **Area:** subscriptions
- **Files:** `src/actions/billing.ts`
- **What:** `fields.set('billing_date', new Date().toISOString().slice(0,10))` — production runs UTC while PayFast operates on SAST and requires billing_date to be today or later in its own timezone. Between 22:00 and 23:59:59 UTC the SAST date has already rolled forward, so the submitted date is yesterday from the gateway's perspective and every subscription checkout is rejected. That is roughly 8% of every day, failing intermittently with no obvious cause in application logs, and 22:00-00:00 UTC is prime evening across the Americas for an international teacher base. Compute with DateTime.now().setZone('Africa/Johannesburg').toISODate(), and adopt the general rule that provider-facing dates are always formatted in the provider's own timezone.
- **Done when:** A checkout initiated at 22:30 UTC is accepted by the sandbox; a unit test with a frozen 22:30 UTC clock asserts the SAST date is submitted.

### 🟠 `MON-27` Accepting a reschedule proposal can move a paid lesson into the past

- [x] **Effort:** S · <½ day · **Area:** bookings
- **Files:** `src/actions/bookings.ts`
- **What:** acceptBookingReschedule validates that the proposal is pending, within the 48-hour window, and that the CURRENT booking start is in the future — but never that proposal.proposedStartsAt > now, and proposeBookingReschedule only validates the time at proposal time. So a lesson tomorrow can be proposed for today 18:00, the student opens the email at 21:00 and accepts, and the confirmed, already-paid booking's startsAt is rewritten to a time that has passed. startSession's window (startsAt-15min to endsAt+30min) is already over, so the lesson can never be held and there is no refund path. Reject when proposedStartsAt <= now and mark the proposal expired; expire proposals at min(createdAt + 48h, proposedStartsAt).
- **Done when:** Accepting a proposal whose proposed time has passed fails with a clear message and marks the proposal expired; a proposal automatically expires at its proposed start time.

### 🟠 `MON-28` Add scheduled lesson finalization and stop the finalizer overwriting cancelled bookings

- [x] **Effort:** M · 1–2 days · **Area:** bookings
- **Files:** `src/server/video/sessions.ts`, `src/actions/video.ts`, `src/actions/bookings.ts`, `vercel.json`, `src/app/api/v1/jobs/expire-pending-payments/route.ts`
- **What:** A booking becomes 'completed' only when the teacher clicks End or when either party happens to load /sessions/[id] more than 30 minutes after endsAt — there is no cron for it (the jobs directory has only expire-pending-payments, session-reminders, process-email-outbox and subscription-lifecycle). If the teacher forgets and nobody revisits, the booking stays confirmed forever: the student never sees the review form, submitReview rejects, teacher analytics undercount, refund windows never open and the north-star metric is wrong. The same lazy finalizer also transitions any session whose endsAt+30 has passed without checking booking.status, so visiting the page for a properly cancelled (possibly refunded) booking flips it from cancelled to no_show, corrupting the cancellation record and no-show analytics. Add a finalize-sessions cron every 15 minutes applying the live→completed / scheduled→no_show transition, guard the lazy finalizer on booking.status === 'confirmed', and mark or delete the VideoSession inside cancelBooking's transaction.
- **Done when:** A confirmed lesson with no page visit is completed within 15 minutes of endsAt+30; visiting the session page for a cancelled booking leaves it cancelled; no-show analytics exclude cancellations.

### 🟠 `MON-31` course-covers storage bucket is never provisioned, making the course marketplace inert

- [x] **Effort:** S · <½ day · **Area:** course-commerce
- **Files:** `src/actions/courses.ts`, `supabase/migrations/20260719234500_storage_hardening.sql`, `supabase/README.md`, `src/server/courses/media.ts`
- **What:** uploadCourseCover writes to supabase.storage.from('course-covers') and reads back getPublicUrl, but that bucket exists nowhere: the storage-hardening migration inserts only avatars, credentials, course-media, course-files and case-evidence; supabase/README.md documents a different set; and the only createBucket calls are for course-media and the teacher intro bucket. Meanwhile canSubmitCourse hard-blocks submission with 'Add a course cover image' when coverImageUrl is null, and the upload failure is swallowed into a generic 'please try again'. On a fresh production deploy the entire course marketplace is inert and the teacher blames their image file. Provision the bucket (add it to the migration or create it lazily like ensureCourseMediaBucket), surface the real storage error distinctly, and keep covers private and signed until the course is published.
- **Done when:** On a freshly provisioned environment a teacher can upload a cover and submit a course; a storage misconfiguration produces a distinct, actionable error rather than a generic retry prompt.

### 🟠 `MON-32` No admin takedown for published courses and sanctioned teachers stay in the catalog

- [x] **Effort:** M · 1–2 days · **Area:** moderation
- **Files:** `src/actions/admin.ts`, `src/server/courses/queries.ts`, `src/features/admin/components/course-moderation-actions.tsx`, `src/app/admin/courses/page.tsx`
- **What:** approveCourse and rejectCourse both refuse anything that is not pending_approval, the moderation component renders null unless status is pending_approval, and getCourseModerationQueue only ever lists pending_approval — so when a rightsholder sends a takedown notice for a live course the admin has literally no button and the only options are a raw DB edit or suspending the teacher. Separately, searchPublishedCourses and getPublishedCourseBySlug do not filter on teacher account status, so a suspended or sanctioned seller's catalog stays live and purchasable. Add takedownCourse(courseId, reason) that sets rejected/suspended, writes an AdminAuditLog row and notifies the teacher while preserving existing enrollments (or revoking them for illegal content); add an admin browse view over published courses; and add a teacher accountStatus and active-sanction exclusion to discovery.
- **Done when:** An admin takes down a published course in one action with an audit entry and teacher notification; suspending a teacher removes their courses from /courses and their sales pages on the next request.

### 🟡 `MON-06` Require capture status COMPLETED before confirming a booking

- [x] **Effort:** S · <½ day · **Area:** lesson-payments · **Blocked by:** MON-04
- **Files:** `src/services/paypal/checkout.ts`, `src/app/api/v1/payments/paypal/complete/route.ts`, `src/server/payments/confirm.ts`
- **What:** The return route checks order.status !== 'COMPLETED' but parsePayPalOrder extracts captures[0].id and amount while dropping captures[0].status. A capture can be PENDING (for example RECEIVING_PREFERENCE_MANDATES_MANUAL_ACTION when the teacher's account does not auto-accept the payment currency, which is plausible with cross-border buyers and multiple settlement currencies) while the order reads COMPLETED — so the booking is confirmed and the room provisioned although the teacher has no funds, and a later denial is not handled because the DENIED webhook is broken. Propagate capture.status, confirm only on COMPLETED, and hold PENDING in a processing state that resolves on the CAPTURE.COMPLETED/DENIED webhooks.
- **Done when:** A PENDING capture leaves the attempt processing and the booking unconfirmed with both parties messaged; the subsequent COMPLETED webhook confirms it and DENIED fails it cleanly.

### 🟡 `MON-07` Checkout double-submit crashes on the idempotency key and mints orphan orders

> **Deferred:** Deferred with the PayPal rail (gated). Idempotency-key collisions and orphan orders only matter if PayPal is re-enabled.

- [ ] **Effort:** S · <½ day · **Area:** lesson-payments
- **Files:** `src/actions/payments.ts`
- **What:** The idempotency key is `${booking.id}:${provider}:${Math.floor(Date.now()/60000)}`. Two clicks inside the same minute make the second paymentAttempt.create throw an unhandled P2002 and the student sees a generic server-action failure instead of being routed to the existing checkout; clicks in different minutes silently mint a brand-new PayPal order each time while the old ones stay approvable, which is precisely the input to the double-capture scenario in MON-01. Reuse an existing pending/requires_action attempt with a live checkout URL and return its approve URL, catch P2002 and return the existing URL, and void the previous order whenever a replacement attempt is created.
- **Done when:** A rapid double-click returns the same checkout URL rather than an error; at most one approvable order exists per booking at any moment.

### 🟡 `MON-08` PayPal auth assertion is an empty string and the partner refund path is dead code

> **Deferred:** Deferred with the PayPal rail (gated). The auth assertion and partner refund path are dead code while the flag is off.

- [ ] **Effort:** S · <½ day · **Area:** refunds · **Blocked by:** PAY-01
- **Files:** `src/services/paypal/checkout.ts`, `src/services/payments/refunds.ts`, `src/actions/refunds.ts`
- **What:** createPayPalOrder sends {'PayPal-Auth-Assertion': ''} whenever PAYPAL_PARTNER_MERCHANT_ID is set — the JWT (base64 header . base64 {iss: client_id, payer_id: merchant_id} .) is never built, so in live partner mode the header is malformed. refundPayPalCapture, the only code able to execute a verified refund against a teacher's capture using the granted THIRD_PARTY REFUND permission, sends no assertion at all and is never called from anywhere, so the refund feature ships with no programmatic path even though onboarding requests the REFUND feature. Either build the assertion correctly and wire refundPayPalCapture into the approved-refund flow with the webhook as source of truth, or delete the dead code and stop requesting the feature. Decide together with PAY-01 so the work is not thrown away.
- **Done when:** No outbound request carries an empty auth-assertion header; either an approved refund executes via API and is confirmed by the CAPTURE.REFUNDED webhook, or the dead function and the REFUND feature request are removed.

### 🟡 `MON-10` Duplicate confirmations re-provision the video room and can 500-loop the webhook

- [x] **Effort:** S · <½ day · **Area:** lesson-payments
- **Files:** `src/server/payments/confirm.ts`, `src/server/video/sessions.ts`, `src/services/livekit/rooms.ts`
- **What:** After the transaction commits, ensureVideoSessionForBooking runs uncaught and runs again on every duplicate confirmation (webhook and return confirm with different providerEventIds), each time calling createLiveKitRoom and upserting a possibly new livekitRoomName that invalidates a join link already emailed. Worse, it throws when booking.startsAt <= now, so a payment confirmed after the scheduled start throws after the DB commit: the webhook returns 500 and the provider retries indefinitely, each retry repeating the side effects. Return the existing session when one is present and tolerate a past startsAt for a paid booking.
- **Done when:** Confirming the same payment twice produces exactly one VideoSession with a stable room name and an HTTP 200; a confirmation arriving after the scheduled start does not 500.

### 🟡 `MON-18` ITN signature verification drops empty fields and may reject every legitimate ITN

- [x] **Effort:** S · <½ day · **Area:** webhooks
- **Files:** `src/services/payfast/signature.ts`, `src/app/api/v1/webhooks/payfast/route.ts`
- **What:** createPayfastSignature excludes any field whose value is an empty string and is reused for ITN verification. Excluding blanks is correct when GENERATING the checkout signature, but PayFast's published ITN verification procedure builds the param string from every posted field except signature, in received order, without filtering empties — and real ITN payloads routinely contain empty fields (unused custom_str/custom_int, empty name_last). If PayFast includes those keys, every production ITN fails verification with 400 and no subscription ever activates. Sandbox may mask this, so it must be verified empirically. Add a dedicated verifyItnSignature that concatenates all received non-signature fields in received order without dropping empties, and keep the existing function for checkout-form generation only.
- **Done when:** Verified against a captured real sandbox ITN containing empty fields: the dedicated verification function passes, checkout signature generation is unchanged, and both are covered by tests.

### 🟡 `MON-20` Grace expiry leaves orgs permanently blocked from even Free-tier activity

- [x] **Effort:** S · <½ day · **Area:** subscriptions
- **Files:** `src/server/billing/run-lifecycle.ts`, `src/server/billing/lifecycle.ts`
- **What:** Grace expiry sets planId=free and subscriptionStatus='cancelled', and isGrowthBlocked returns true unconditionally for cancelled status — a gate that blocks new bookings and course actions everywhere. So a lapsed teacher cannot use even Free-plan allowances and is read-only forever unless they buy a paid plan, contradicting PROJECT.md's '14 days read-only' and docs/PayFast.md's state table (cancelled → free with Free limits). It punishes teachers whose card merely expired and destroys win-back. The same update also never clears pendingPlanId/pendingChangeAt. Set subscriptionStatus to active on the Free plan (Free limits already constrain growth) or time-bound the cancelled block, and clear the pending fields in the same update.
- **Done when:** After grace expiry the org can create a Free-tier booking within Free limits, and pendingPlanId/pendingChangeAt are null.

### 🟡 `MON-21` Complimentary grant permanently destroys a paying org's subscription

- [x] **Effort:** M · 1–2 days · **Area:** subscriptions
- **Files:** `src/actions/admin-subscriptions.ts`, `src/server/billing/entitlements.ts`, `src/server/billing/run-lifecycle.ts`
- **What:** Granting a complimentary plan to an org with an active paid subscription cancels the PayFast subscription and nulls the token. When the complimentary period expires, both expiry paths drop the org to Free — complimentaryPreviousPlanId is stored but never used to restore anything, and the cancelled billing cannot be resurrected. An admin granting a one-month thank-you upgrade to a paying Business subscriber silently converts them into a Free, non-paying org that must re-checkout from scratch: recurring revenue destroyed by a goodwill gesture. Block or loudly warn when the org has an active token (require explicit confirmation that the subscription will be destroyed), and implement restore-to-previous-plan by prompting re-checkout before expiry using the stored previous plan id.
- **Done when:** Granting complimentary access to a paying org requires explicit confirmation, and at expiry the org is prompted back onto complimentaryPreviousPlanId rather than silently dropped to Free.

### 🟡 `MON-22` Promotional plan discounts become permanent lifetime discounts

- [x] **Effort:** S · <½ day · **Area:** subscriptions
- **Files:** `src/actions/billing.ts`, `src/server/billing/pricing.ts`
- **What:** An active PlanSale percentOff is applied to recurring_amount itself, so a time-limited promotion (a 30% launch weekend) becomes a lifetime discount for everyone who checked out during it, and the amount is never re-baselined when the sale ends. Existing subscribers are also locked at the amount computed on their checkout date indefinitely. Decide explicitly and implement one: charge the discounted amount as the first-cycle `amount` with `recurring_amount` at list price, or document the lifetime-discount intent so revenue projections and the pricing page reflect it.
- **Done when:** A subscriber who checks out during a 30% sale is charged list price at the first renewal after the sale ends, or the lifetime intent is written into the pricing docs and shown at checkout.

### 🟡 `MON-24` Subscription invoices hardcode ZAR for a USD-priced catalog

- [x] **Effort:** S · <½ day · **Area:** subscriptions
- **Files:** `src/app/api/v1/webhooks/payfast/route.ts`, `prisma/schema.prisma`, `src/app/dashboard/teacher/billing/page.tsx`
- **What:** The ITN handler creates subscriptionInvoice with `currency: 'ZAR'` as a literal and SubscriptionInvoice.currency defaults to 'ZAR' in the schema — the only remaining ZAR default, while every other currency column defaults to USD. The billing page renders it through formatCurrency, which routes ZAR to en-ZA, so a teacher in Germany who selected a plan advertised at $29/month receives an invoice reading 'R 539,00'. Persist presentment amount and currency (USD, what the teacher was quoted) and settled amount and currency separately, change the schema default to USD with a data migration, and display the quoted currency primarily with settlement as a secondary line.
- **Done when:** An invoice for a $29 plan renders '$29.00' with the settled amount as a secondary line; the schema default is USD and existing rows are migrated.

### 🟡 `MON-26` Coupon maxRedemptions over-redeems under concurrency and the cleanup is dead code

- [x] **Effort:** M · 1–2 days · **Area:** course-commerce
- **Files:** `src/server/courses/pricing.ts`, `src/server/payments/confirm.ts`, `src/actions/payments.ts`
- **What:** resolveCoursePrice rejects a coupon when confirmed redemptions >= maxRedemptions, but for paid purchases the CourseCouponRedemption row is written only after payment confirms, so in-flight checkouts are invisible and the limit is never re-validated at confirmation. Forty students opening a 'first 10 at 80% off' coupon in the same minute all pass the check, are all quoted the discounted price, and all complete checkout. The compensating cleanups (deleteMany by purchaseId in the checkout failure path and in expireAbandonedPayments) can never match a row because none exists yet. Reserve the redemption inside the same transaction that creates the pending CoursePurchase, so the existing cleanup actually releases it on cancel or expiry, and/or re-count and re-validate inside confirmCoursePayment before granting enrollment.
- **Done when:** Forty concurrent checkouts against a maxRedemptions=10 coupon produce exactly ten discounted purchases; the cleanup deleteMany measurably releases reservations on cancel and expiry.

### 🟡 `MON-29` Add a DB-level double-booking constraint and close the propose/cancel slot-hold gaps

- [x] **Effort:** M · 1–2 days · **Area:** bookings
- **Files:** `prisma/schema.prisma`, `src/actions/bookings.ts`, `src/server/availability/slots.ts`
- **What:** Booking has no exclusion or uniqueness constraint on (teacherId, time range) — only plain indexes — so concurrency safety rests entirely on every write path remembering a Serializable transaction with a collision check. createBooking, scheduleLessonAsTeacher and acceptBookingReschedule do; proposeBookingReschedule does not: its slot-hold check runs outside any transaction and the proposal is created in a separate non-serializable one, so a student booking a slot concurrently with a teacher proposing it can both succeed. Separately, cancelBooking never cancels the booking's pending reschedule proposals, and all slot-hold queries filter proposals only on status and expiresAt rather than the parent booking's status, so a cancelled lesson's proposed slot stays unbookable for up to 48 hours of lost inventory. Add a btree_gist exclusion constraint on (teacher_id, tstzrange(starts_at, ends_at)) WHERE status IN ('pending_payment','confirmed') via a raw migration, move the propose-hold check inside a serializable transaction, and cancel pending proposals inside cancelBooking's transaction.
- **Done when:** A concurrent create + propose for the same slot yields exactly one hold; cancelling a booking frees its proposed slot immediately; the exclusion constraint exists in a checked-in migration and app-level checks still produce friendly errors.

### 🟡 `MON-30` Reminder deduplication ignores reschedules, so lessons are reminded at the wrong time or not at all

- [x] **Effort:** S · <½ day · **Area:** notifications
- **Files:** `src/app/api/v1/jobs/session-reminders/route.ts`, `src/server/notifications/notify.ts`, `src/actions/bookings.ts`
- **What:** The reminder job dedupes by finding ANY prior 'session.reminder' notification whose metadata.bookingId matches, and buildEmailIdempotencyKey is keyed on bookingId alone — while acceptBookingReschedule rewrites startsAt on the same booking row. So if a reminder fired for the original 10:00 slot and the lesson moves to 18:00, the 17:00 job run finds alreadySent and skips: both parties' only reminder points at a time that no longer exists, a direct missed-lesson risk given calendar sync is best-effort. Include the lesson start timestamp in both the notification metadata dedupe key and the email idempotency key so each (booking, scheduled time) pair gets exactly one reminder, and verify the reschedule-accepted notification states the new time.
- **Done when:** Rescheduling a booking that already had a reminder produces exactly one new reminder for the new time, and a booking never receives two reminders for the same start time.

### 🟡 `MON-33` Any edit to a published course silently delists it and forces a fresh review

- [x] **Effort:** S · <½ day · **Area:** course-commerce
- **Files:** `src/actions/courses.ts`
- **What:** updateCourse computes substantiveChange across title, description, subjectId, priceCents, currency, level and certificateEnabled, and when the course is live resets it to `draft` — not pending_approval — so the course does not even re-enter the moderation queue automatically. A teacher fixing a typo, flipping the certificate toggle, or dropping the price for a promotion instantly removes the course from /courses and 404s its sales page, with no warning in the UI, losing days of traffic and sales before they realise they must resubmit and wait out the 48-hour review SLA. Trigger re-review only on material content changes (title, description, curriculum), never on price, currency or certificateEnabled; keep the course live and purchasable during re-review; set pending_approval automatically; and warn in the edit UI before saving.
- **Done when:** Changing price or certificateEnabled leaves the course published; a title or curriculum change keeps it purchasable while enqueued for review, with an explicit in-UI warning before save.

### 🟡 `MON-34` Buyers are shown the teacher's private billing status and hit dead-end checkouts

- [x] **Effort:** S · <½ day · **Area:** course-commerce
- **Files:** `src/actions/payments.ts`, `src/server/courses/queries.ts`, `src/server/billing/lifecycle.ts`
- **What:** startCourseCheckout calls getOrganizationGrowthWriteBlock and returns its string verbatim to the buyer, and the purchase button toasts it — so a student clicking Buy is told a stranger's subscription payment is at least 7 days overdue and that they should 'recover billing'. The course is still listed with a working Buy button because searchPublishedCourses does not filter on billing state, so the student hits a dead end with no explanation and the teacher never learns they lost the sale. Return a neutral buyer-facing message and log the real reason server-side, exclude courses from past-due or lapsed organisations from discovery and the sales page, and notify the teacher that their courses have been delisted.
- **Done when:** A buyer never sees another user's billing state; courses from past-due orgs do not appear in /courses and their sales pages are not purchasable; the affected teacher is notified.

### 🟡 `MON-35` Certificates are issued on self-reported progress and survive refunds

- [x] **Effort:** M · 1–2 days · **Area:** course-commerce
- **Files:** `src/server/courses/certificates.ts`, `src/actions/courses.ts`, `prisma/schema.prisma`, `src/app/certificates/[code]/page.tsx`, `src/lib/refunds/policy.ts`
- **What:** Eligibility is simply that every lesson has a CourseLessonProgress row with completedAt, and those rows come from markLessonComplete — a plain 'Mark complete' button with no watched-duration, dwell-time or assessment check. A student can click through a 40-lesson course in under a minute and receive a verifiable credential. CourseCertificate has no revokedAt column, and applyRefundToAttempt revokes the enrollment but leaves the certificate valid, while the public verification page renders whatever it finds as valid with no status field. The refund-eligibility progress check reads the same self-marked rows, so the refund window is gameable from the same data. Require a real completion signal (player-reported watch percentage, minimum dwell, or a quiz pass), add revokedAt/revocationReason, revoke whenever the enrollment is revoked or the purchase refunded, and render revoked state prominently on the verification page.
- **Done when:** Clicking through every lesson in under a minute does not issue a certificate; refunding a purchase marks the certificate revoked and the public verification page says so.

### 🟡 `MON-36` Reconcile course entitlements with the plan catalog and delete the duplicate usage helper

- [x] **Effort:** M · 1–2 days · **Area:** entitlements
- **Files:** `src/actions/courses.ts`, `prisma/seed.ts`, `src/server/courses/access.ts`, `src/server/billing/entitlements.ts`, `src/server/billing/pricing.ts`, `PROJECT.md`
- **What:** PROJECT.md, which declares itself the single source of truth, promises Free = 1 course and Starter and above = unlimited at $9/$19/$39. The seed sets courseLimit 0/0/5/10 at $12/$29/$49 with Business capped at 10, and COURSE_AUTHORING_PLANS hard-gates authoring to professional and business, so a Starter subscriber told they have unlimited courses hits a Professional-only wall and a Business subscriber hits a ceiling the spec calls unlimited. Marketing bullets are generated from the DB values, so the public pricing page disagrees with spec-derived copy elsewhere. Separately getCourseUsage is implemented twice with different shapes (access.ts, used by createCourse, and entitlements.ts, which additionally drives the upsell), so the upsell never fires on one path. Pick one source of truth, make the authoring gate data-driven off courseLimit rather than a hardcoded slug set, and delete the duplicate.
- **Done when:** Plan limits and prices exist in exactly one place, the pricing page and PROJECT.md agree with it, and hitting a course limit produces the upgrade upsell rather than a bare error.

### ⚪ `MON-19` Monthly period-end drifts on month-end billing anniversaries

- [x] **Effort:** S · <½ day · **Area:** subscriptions
- **Files:** `src/app/api/v1/webhooks/payfast/route.ts`
- **What:** nextPeriodEnd uses date.setUTCMonth(date.getUTCMonth() + 1) on the stored currentPeriodEnd, so a Jan 31 anchor overflows to Mar 3, and because each renewal extends the previously stored value the anniversary creeps forward a few days over successive month-end cycles. This affects displayed renewal dates, invoice periodEnd, and pendingChangeAt timing since scheduled downgrades take effect at currentPeriodEnd. Clamp to the last day of the target month using standard billing-anniversary logic, or anchor renewals to the original signup day-of-month.
- **Done when:** Unit test: Jan 31, Feb 29 and Aug 31 anchors produce Feb 28/29, Mar 29 and Sep 30 respectively, with zero cumulative drift across 24 simulated cycles.

### ⚪ `MON-25` The 14-day paid trial is unreachable dead code that the docs advertise

- [x] **Effort:** S · <½ day · **Area:** subscriptions
- **Files:** `src/server/billing/lifecycle.ts`, `src/server/billing/run-lifecycle.ts`, `docs/PayFast.md`
- **What:** startPaidTrial is exported and unit-tested but never called from any registration, checkout or admin flow — grep finds usages only in lifecycle.ts and its own test. Meanwhile docs/PayFast.md's state table promises 'trialing — full Pro features, 14 days', and both the ITN handler and the lifecycle cron carry trialing branches that are unreachable in practice. New teachers land directly on Free. Either wire the trial into teacher onboarding (grant trialing plus a trial plan at solo-org creation) or delete the function, the unreachable branches and the docs claim so the marketing surface matches reality.
- **Done when:** Either a newly onboarded teacher org lands in trialing with a trialEndsAt and exits correctly at expiry, or startPaidTrial, the trialing branches and the docs row are all removed.

---

## P2 — Payment re-architecture

Three separate rails, no shared provider account, no shared money code path. Blocked on the provider confirmations in the Week 1 emails.

<sub>16 tasks · 6 critical · 8 high · 2 medium</sub>

### 🔴 `PAY-01` Write the payments architecture decision record that resolves the commission/tax tension

- [ ] **Effort:** M · 1–2 days · **Area:** architecture
- **Files:** `docs/PaymentsArchitecture.md`, `docs/LessonPayments.md`, `PROJECT.md`, `docs/Vision.md`
- **What:** Requirements 2 and 5+6 are in genuine tension: taking a commission and collecting tax at checkout requires someone to receive the gross amount and split it. Resolve it by splitting the two product lines rather than papering over it. (a) LIVE LESSONS — the teacher is merchant of record; the student pays the teacher's own hosted checkout link; the platform never receives funds, takes 0%, and collects no tax because it is not a party to the supply (the teacher's own tax obligation, stated in the teacher agreement). Accepted cost, written down explicitly: no webhook-verified confirmation, no platform-guaranteed refunds, unmediated disputes, and no leverage against a bad-faith teacher. (b) COURSES — a merchant of record acting for the platform is the seller; it receives gross, computes and remits tax at checkout, the platform retains 10%, and teachers are paid 90% as supplier payouts. Requirement 2 constrains live lessons only, so this does not violate it. Record the rejected options and why: Stripe Connect is unavailable to a South-African-registered platform; Rapyd and Adyen route funds through platform-controlled wallets; Gumroad pays out via Stripe Connect; Lemon Squeezy is converging into Stripe Managed Payments; Paystack is ZAR-only settlement with no MoR function; Wise and Payoneer are receivables rails, not billing rails. State plainly that any design where lesson funds transit a platform-controlled balance 'briefly' is legally holding funds and is out of scope.
- **Done when:** A committed ADR the founder has signed off, naming the chosen provider per product line, the commission and tax posture of each, the payout mechanism for course earnings, and the explicit trade accepted on lesson disputes. Every other P2 task references it.

### 🔴 `PAY-02` Confirm merchant-of-record eligibility for a South African supplier, in writing

- [ ] **Effort:** M · 1–2 days · **Area:** vendor-diligence · **Blocked by:** external: MoR provider sales and compliance response
- **Files:** `docs/PaymentsArchitecture.md`
- **What:** The MoR is what makes requirements 3 (get paid by teachers in any country and withdraw to a South African bank), 5 (10% on course sales) and 6 (tax collected at checkout) achievable without the founder registering for VAT in dozens of jurisdictions — for EU B2C digital services the registration threshold for a non-EU seller is zero, and the UK threshold applies only to UK-established businesses. Obtain written confirmation from Paddle (primary candidate: ZAR is one of 13 documented payout currencies, South Africa is not on its sanctions-driven exclusion list, published pricing ~5% + 50c) and at least one fallback (FastSpring, 2Checkout/Verifone, Polar), covering four questions: can a South-African-registered entity onboard as a supplier; can payouts land in ZAR in a South African bank account; do their terms permit a marketplace of third-party-authored courses; are both recurring subscriptions and one-off purchases supported. Model fee impact per tier — a fixed 50c is 9.2% on a $12 tier, so decide annual-only, a price rise, or accepting it as an acquisition cost before migrating.
- **Done when:** Written eligibility confirmation on file from at least one MoR covering all four questions, a per-tier fee model, and a recorded decision. Treat as an external dependency with real latency — start immediately.

### 🔴 `PAY-04` Implement merchant-of-record subscription checkout, webhooks and lifecycle mapping

- [ ] **Effort:** XL · 2+ weeks · **Area:** subscriptions · **Blocked by:** PAY-02
- **Files:** `src/actions/billing.ts`, `src/server/billing/run-lifecycle.ts`, `prisma/schema.prisma`, `src/lib/env.ts`, `src/app/api/v1/webhooks/payfast/route.ts`
- **What:** Implement the chosen MoR behind the PAY-03 interface: hosted checkout presenting the price in the teacher's own currency with tax computed and shown at checkout, signature-verified webhooks for subscription created/updated/paused/cancelled and payment succeeded/failed mapped onto the existing Organization fields (planId, subscriptionStatus, currentPeriodEnd, grace and dunning), provider-side dunning and hosted card update replacing the home-grown retry promises that currently have no backing mechanism, and invoices carrying both presentment and settlement amounts. This is the task that satisfies requirement 3 — teachers in any country pay, and the founder withdraws to a South African bank in ZAR.
- **Done when:** A teacher in the EU subscribes with a local card, is charged in their own currency with tax shown before commitment, the org activates from the webhook, a failed renewal drives grace and provider-side retries, and a cancellation at the provider downgrades the org at period end.

### 🔴 `PAY-07` Teacher payment-link model — the founder's "link on their account"

- [ ] **Effort:** L · ~1 week · **Area:** lesson-payments · **Blocked by:** PAY-01
- **Files:** `prisma/schema.prisma`, `src/actions/payment-linking.ts`, `src/lib/validations/teacher-onboarding.ts`, `src/app/dashboard/teacher/payments/page.tsx`, `src/server/teachers/payments.ts`
- **What:** Requirement 4 and requirement 7: replace the single PayPal partner integration with a teacher-owned payment link that supports multiple payment methods and does not depend on any partner approval. Extend or replace TeacherPaymentAccount with provider (chosen from a curated allowlist of hosted-checkout products available in the teacher's country — Stripe Payment Links, Revolut, Wise, Mollie, Razorpay, Payoneer request links, and PayPal for teachers who still want it), a URL validated against an allowlist of provider hosts (https only, never javascript:/data:, no open redirect), display currency, declared accepted methods, and a verification state with a test-payment confirmation step. Render it in checkout as a single branded 'Pay your teacher' action so the student experience is one click to a real hosted checkout. Teachers keep 100% and the platform never touches the funds.
- **Done when:** A teacher can save a link from any allowlisted provider and preview exactly what the student sees; a student reaches a working hosted checkout offering card plus local methods in one click; links from non-allowlisted hosts or non-https schemes are rejected.

### 🔴 `PAY-08` Lesson checkout state machine for teacher-of-record payments

- [ ] **Effort:** XL · 2+ weeks · **Area:** lesson-payments · **Blocked by:** PAY-07
- **Files:** `src/actions/payments.ts`, `src/server/payments/confirm.ts`, `prisma/schema.prisma`, `src/features/payments/components/booking-checkout-buttons.tsx`, `src/app/dashboard/bookings/[id]/page.tsx`
- **What:** With no webhook available from the teacher's own provider, capture-driven confirmation must be replaced by an attested flow: booking created → awaiting_payment (student redirected to the teacher's link, slot held for the payment window) → student marks paid with a reference → teacher confirms receipt (or auto-confirms after a configurable window if the teacher opts in) → confirmed. Keep the PaymentAttempt ledger for the audit trail, keep expiry clean, and carry forward every state guard from MON-01, MON-02 and MON-03 so the new machine cannot resurrect dead bookings or cancel paid ones. Confirmed bookings must still trigger room provisioning, notifications and calendar sync through the hardened path from MON-11.
- **Done when:** A booking can be paid and confirmed end to end with no platform-side capture; an unconfirmed payment expires and releases the slot; every state transition is conditional and covered by a test, including the confirm-versus-expire race in both directions.

### 🔴 `PAY-10` Course commerce as seller of record with a 10% platform commission and tax at checkout

- [ ] **Effort:** XL · 2+ weeks · **Area:** course-commerce · **Blocked by:** PAY-02
- **Files:** `src/actions/payments.ts`, `src/server/payments/confirm.ts`, `prisma/schema.prisma`, `src/server/courses/pricing.ts`, `src/app/courses/[slug]/page.tsx`
- **What:** Route course purchases through the MoR: the buyer pays a gross amount inclusive of tax computed at checkout, and the platform records the order with explicit gross, tax, net, commission (10%) and teacher-earning lines, granting the enrollment only on a verified provider webhook rather than a browser redirect (which is what makes the current course flow silently fail per MON-04). This is the only architecture that satisfies requirements 5 and 6 simultaneously, and it necessarily means the platform touches course money — permitted, because requirement 2 constrains live lessons only. Preserve the coupon reservation fix from MON-26 and the refund effects from MON-09 in the new flow.
- **Done when:** A course purchase displays a tax-inclusive total before the buyer commits, produces an order with correct commission and teacher-earning lines, and grants access only after webhook verification; a refund reverses all lines.

### 🟠 `PAY-03` Introduce a subscription provider abstraction so the gateway is swappable

- [ ] **Effort:** L · ~1 week · **Area:** subscriptions · **Blocked by:** PAY-01
- **Files:** `src/actions/billing.ts`, `src/server/billing/run-lifecycle.ts`, `src/lib/payments/provider-flags.ts`, `src/lib/payments/routing.ts`, `src/server/billing/settings.ts`, `src/services/payfast/subscriptions.ts`
- **What:** Subscriptions are hardwired to a single gateway end to end — the checkout field builder, the ITN handler, the lifecycle amendment path, the payfastConfigured settings gate and user-visible copy — while lesson payments already have a provider-flag and routing pattern that subscriptions conspicuously lack. Define a SubscriptionProvider interface (createCheckout, updateSubscription, cancelSubscription, parseWebhook, mapStatus, supportsHostedCardUpdate) with the existing gateway as one implementation selected by config, so the migration in PAY-04 is additive rather than a rewrite of billing.ts and run-lifecycle.ts.
- **Done when:** The existing gateway still works end to end behind the interface, and adding a second provider requires no changes inside src/actions/billing.ts or src/server/billing/run-lifecycle.ts.

### 🟠 `PAY-05` Migrate existing subscribers off PayFast and decommission the rail

- [ ] **Effort:** L · ~1 week · **Area:** subscriptions · **Blocked by:** PAY-04
- **Files:** `src/actions/billing.ts`, `src/app/api/v1/webhooks/payfast/route.ts`, `src/services/payfast/subscriptions.ts`, `src/services/payfast/signature.ts`, `src/server/billing/run-lifecycle.ts`, `next.config.ts`, `docs/PayFast.md`
- **What:** Dual-run plan: stop new PayFast checkouts, invite existing subscribers to re-authorise on the MoR (recurring mandates cannot be transferred between providers), keep the ITN handler running read-only until the last token is retired, then delete the PayFast service directory, env vars, the CSP form-action entry hardwired to payfast.co.za, and docs/PayFast.md. This permanently removes PAYFAST_USD_ZAR_RATE, the ZAR charge path, the SAST billing_date defect (MON-23) and the hardcoded ZAR invoice currency (MON-24) rather than maintaining them.
- **Done when:** Zero organisations hold a payfastToken, PAYFAST_* variables are removed from every environment, PayFast appears in no CSP directive and in no user-visible copy, and the ITN route is deleted.

### 🟠 `PAY-06` Capture billing country and tax identifier on the organization

- [ ] **Effort:** M · 1–2 days · **Area:** tax · **Blocked by:** PAY-01
- **Files:** `prisma/schema.prisma`, `src/actions/billing.ts`, `src/features/billing/components/billing-plan-selector.tsx`, `src/server/billing/settings.ts`
- **What:** The current checkout field map carries no billing country, no VAT/GST identifier and no tax line, and there is no billingCountry or vatNumber anywhere on the organization path — so the platform cannot even compute or evidence its own liability, and the MoR cannot determine the correct rate. Location evidence is required regardless of which rail wins. Add billingCountry (ISO 3166-1 alpha-2) and an optional taxId/vatNumber to Organization, capture both at checkout, pass them to the provider, and store the tax breakdown the provider returns.
- **Done when:** Every new subscription records a billing country; the provider's tax amount and jurisdiction are stored on SubscriptionInvoice and displayed on the billing page.

### 🟠 `PAY-09` Anti-fraud and trust controls for attested lesson payments

- [ ] **Effort:** M · 1–2 days · **Area:** trust-safety · **Blocked by:** PAY-08
- **Files:** `src/actions/payments.ts`, `src/actions/refunds.ts`, `src/app/refund-policy/page.tsx`, `src/app/admin/trust/page.tsx`, `src/lib/security/rate-limit.ts`
- **What:** Attestation is the price of the zero-touch model and it is abusable in both directions: a student can claim they paid without paying, and a teacher can deny receipt or take payment and not appear. Add per-user rate limits on 'I have paid' claims, a dispute path that escalates to admin with the payment reference attached, teacher receipt-confirmation SLAs with reminders, a visible teacher payment-reliability and response-time record, and automatic suspension triggers for repeat offenders on either side. This is the mitigation for the trade accepted in PAY-01.
- **Done when:** A student who claims payment three times with no teacher confirmation is throttled and flagged; disputes appear in the admin trust queue with evidence; teacher reliability is visible on the profile.

### 🟠 `PAY-11` Teacher earnings ledger and payout runs for course sales

- [ ] **Effort:** XL · 2+ weeks · **Area:** payouts · **Blocked by:** PAY-10
- **Files:** `prisma/schema.prisma`, `src/server/teachers/earnings.ts`, `src/app/dashboard/teacher/payments/page.tsx`, `src/app/admin/payments/page.tsx`
- **What:** Once the platform receives course gross it owes teachers 90%, which the codebase has no concept of today. Build a double-entry-style earnings ledger (sale, refund, chargeback, commission, payout, adjustment), a payable balance per teacher, minimum payout thresholds, scheduled payout runs through an international mass-payout rail (Wise, Payoneer or PayPal Payouts — selection recorded in PAY-01), downloadable payout statements, and a reserve or hold period covering the refund window so the platform does not pay out money it must return. Paying your own suppliers is not money transmission, but the ledger must be auditable.
- **Done when:** A course sale credits the teacher 90% and the platform 10%; a refund reverses both; a payout run moves the payable balance and produces a statement that reconciles to the ledger to the cent.

### 🟠 `PAY-12` Tax at checkout: storage, display, invoices and receipts

- [ ] **Effort:** M · 1–2 days · **Area:** tax · **Blocked by:** PAY-10
- **Files:** `prisma/schema.prisma`, `src/server/payments/confirm.ts`, `src/app/dashboard/teacher/billing/page.tsx`, `src/app/courses/[slug]/page.tsx`, `src/app/terms/page.tsx`
- **What:** Requirement 6. Rely on the MoR's tax engine for subscriptions and course sales rather than building multi-jurisdiction tax logic. Store the provider's breakdown (jurisdiction, rate, amount, the tax identifier used, and the seller of record) on SubscriptionInvoice and CoursePurchase, show tax-inclusive totals before the buyer commits, and issue receipts and invoices naming the correct seller of record. Document plainly in the teacher agreement and the lesson checkout that lesson payments carry no platform-collected tax and the teacher is responsible for their own — this is the honest consequence of the teacher-of-record model and must be visible, not buried.
- **Done when:** A buyer in the EU sees the VAT-inclusive price before paying and receives a receipt showing the tax line and the MoR as seller; the lesson checkout and teacher agreement state the teacher-of-record tax position explicitly.

### 🟠 `PAY-13` Decommission the PayPal partner/multiparty code path

- [ ] **Effort:** M · 1–2 days · **Area:** lesson-payments · **Blocked by:** PAY-08
- **Files:** `src/services/paypal/checkout.ts`, `src/app/api/v1/payments/paypal/callback/route.ts`, `src/app/api/v1/payments/paypal/complete/route.ts`, `src/app/api/v1/webhooks/paypal/route.ts`, `src/actions/payment-linking.ts`, `src/lib/payments/provider-flags.ts`, `docs/LessonPayments.md`
- **What:** Once teacher payment links are live, remove the partner-referral onboarding flow, the platform-brokered order creation and capture, the auth-assertion plumbing, the partner refund path and the LESSON_PAYMENTS_PAYPAL_ENABLED gate — the whole surface whose existence depended on a partner approval the founder does not want to pursue. Sequencing matters: SEC-02 and MON-01 through MON-06 must land first because this code is live and exploitable today; do not defer security fixes on the grounds that the code is scheduled for deletion. PayPal remains available to teachers as one payment-link option on their own account, which requires no partner approval at all.
- **Done when:** No code path exists in which the platform creates or captures a PayPal order on a teacher's behalf; teachers using PayPal do so through their own link; docs/LessonPayments.md is rewritten around the new architecture.

### 🟠 `PAY-14` Capture teacher country and enforce payout eligibility at onboarding

- [ ] **Effort:** M · 1–2 days · **Area:** onboarding · **Blocked by:** PAY-01
- **Files:** `prisma/schema.prisma`, `src/actions/teacher-onboarding.ts`, `src/lib/validations/teacher-onboarding.ts`, `src/app/dashboard/teacher/payments/page.tsx`
- **What:** TeacherPaymentAccount.country exists in the schema but is only ever read and never written by any onboarding or linking flow, and nothing tells a teacher up front whether they can actually be paid. The failure mode is severe under a zero-touch model: a teacher completes a profile, gets approved, teaches a lesson, and only then discovers they cannot receive money — and because the platform never held the funds it cannot make them whole. Capture country at onboarding, hold a dated eligibility matrix per payment-link provider (for lessons) and per payout rail (for course earnings), and tell the teacher at signup which options are open to them. Never allow onboarding to complete into an unpayable state.
- **Done when:** A teacher in a country with no supported option is told during onboarding with the alternatives listed; the eligibility matrix is a single dated source of truth in code with a scheduled re-verification reminder.

### 🟡 `PAY-15` Decouple marketplace listing from payment linking

- [ ] **Effort:** M · 1–2 days · **Area:** onboarding · **Blocked by:** PAY-07
- **Files:** `src/app/dashboard/teacher/payments/page.tsx`, `src/actions/teacher-onboarding.ts`, `src/server/marketplace/teachers.ts`, `src/features/marketing/components/faq.tsx`
- **What:** Marketplace approval currently requires a linked payment account (documented in PROJECT.md and asserted in the public FAQ), which places the highest-friction step before the teacher has any evidence the platform will bring them students. Let teachers be approved and listed immediately, and require a payment link only before their first paid booking can be confirmed — prompt them when the first booking request arrives. This is the single cheapest supply-side conversion improvement in the backlog.
- **Done when:** A teacher with no payment link can be approved and appears in /find-tutor; an incoming booking request triggers a link-setup prompt and the booking cannot be confirmed until a link exists.

### 🟡 `PAY-16` Payment readiness checks and admin payment visibility

- [ ] **Effort:** S · <½ day · **Area:** ops · **Blocked by:** PAY-08
- **Files:** `src/app/api/v1/health/ready/route.ts`, `src/server/billing/settings.ts`, `src/app/admin/payments/page.tsx`, `src/lib/env.ts`
- **What:** Today LESSON_PAYMENTS_PAYPAL_ENABLED defaults to false and routeLessonProviders() returns an empty array with the flag off, so every booking sits in pending_payment until the cron cancels it — with no warning anywhere in the product. Add a readiness check and an admin panel showing, per environment: which lesson payment mechanisms are live, how many approved teachers have a usable payment link, MoR webhook delivery health and last-received timestamps, and the current count of bookings and purchases stuck awaiting payment.
- **Done when:** An environment with no working payment mechanism fails the readiness endpoint and shows a red banner in admin instead of silently cancelling every booking.

---

## P3 — Make it actually international

Timezone, locale, currency, discovery. The platform currently assumes everyone lives in Johannesburg.

<sub>14 tasks · 3 critical · 8 high · 3 medium</sub>

### 🔴 `INT-01` Detect and store the user's timezone at signup; drop the Africa/Johannesburg default

- [x] **Effort:** M · 1–2 days · **Area:** timezone
- **Files:** `prisma/schema.prisma`, `src/server/auth/session.ts`, `src/app/register/page.tsx`, `src/actions/auth.ts`, `src/lib/validations/auth.ts`
- **What:** User.timezone defaults to 'Africa/Johannesburg', syncUserFromAuth creates the row with only id/email/name/avatarUrl so the default always wins, the registration form has no timezone field, and a repo-wide grep for resolvedOptions, navigator.language and Accept-Language returns zero hits — nothing anywhere detects the browser zone. Every international student and teacher who does not discover the buried settings form is silently on South African time, and this is the root cause of the wrong-booking defects below. Capture Intl.DateTimeFormat().resolvedOptions().timeZone client-side at registration and pass it through signUp and syncUserFromAuth, drop the column default (or set a neutral UTC sentinel), and show a persistent confirmation banner to any user still unset or still on the old default until they confirm.
- **Done when:** A user registering from a New York browser has timezone America/New_York with no manual step; existing users on the default see a one-time confirmation prompt before their next booking.

### 🔴 `INT-04` Booking emails must render each recipient's own timezone

- [x] **Effort:** S · <½ day · **Area:** timezone · **Blocked by:** INT-03
- **Files:** `src/server/notifications/notify.ts`
- **What:** notifyBookingCreated computes a single `const when = formatDateTime(booking.startsAt, booking.teacher.timezone)` and reuses that same string in both the teacher's and the student's notification and email. A New York student booking a Tokyo teacher is told 'your lesson is reserved for 10 Aug, 09:00' when it is 20:00 on 9 Aug for them. booking.student.timezone is already selected in the query and simply unused, and the sibling functions (confirmed, cancelled, reminder) already do this correctly — it is a one-line oversight with a direct missed-lesson cost.
- **Done when:** A unit test asserts the student's and teacher's rendered strings differ when their zones differ, for every notification that quotes a lesson time.

### 🔴 `INT-05` Regroup the slot picker by the viewer's local date

- [x] **Effort:** M · 1–2 days · **Area:** booking-ux · **Blocked by:** INT-03
- **Files:** `src/features/bookings/components/slot-picker.tsx`, `src/server/availability/slots.ts`
- **What:** getAvailableSlots computes each slot's date from the TEACHER's local ISO date; the picker builds day tabs by grouping on that server field but labels each tab by formatting the first slot's startsAt in viewerTimeZone and renders each slot as a bare time in viewerTimeZone with no date. Reproduced: a Tokyo teacher's Monday 09:00-17:00 window viewed from New York produces one tab labelled 'Sun, 09 Aug' whose buttons are 20:00-23:00 — the student clicks Sunday and books Monday. Adjacent tabs can even render identical labels. This is a wrong-booking bug, not a display bug. Derive date keys client-side from startsAt in viewerTimeZone and build tabs from those, keep the server's teacher-anchored date for teacher-facing views only, and render weekday plus date on every slot button or as a sticky group header so the day is never implied solely by a tab.
- **Done when:** A Tokyo teacher viewed from New York produces tabs whose labels match the day the student is actually booking, with the date visible on each slot; a cross-midnight case is covered by a test.

### 🟠 `INT-02` Replace the hand-curated timezone list and unify IANA validation across both roles

- [x] **Effort:** M · 1–2 days · **Area:** timezone · **Blocked by:** INT-01
- **Files:** `src/lib/timezone.ts`, `src/actions/student-settings.ts`, `src/lib/validations/teacher-onboarding.ts`, `src/actions/teacher-onboarding.ts`, `src/features/teacher-onboarding/components/onboarding-wizard.tsx`
- **What:** TIMEZONE_OPTIONS is a 46-entry Africa-first array (Africa/Johannesburg first, eight African zones leading) missing Asia/Manila, Asia/Jakarta, Asia/Kuala_Lumpur, Asia/Ho_Chi_Minh, Asia/Taipei, Europe/Warsaw, Europe/Kyiv, Europe/Madrid, America/Bogota, America/Lima, America/Santiago, Asia/Kathmandu (+5:45), Asia/Tehran (+3:30), Asia/Kabul (+4:30), Asia/Yangon (+6:30) and America/St_Johns (-3:30) — and it is enforced server-side for students, so a teacher in Manila literally cannot store their own zone, while users forced into a neighbouring-offset zone inherit that zone's DST rules and are silently wrong for months. Meanwhile the teacher path accepts any 100-character string and writes it straight to user.timezone, so an invalid zone later throws inside localDateTimeToUtc and breaks that teacher's availability page — the two halves of the same column have opposite validation contracts. Replace the array with Intl.supportedValuesOf('timeZone') grouped by region in a searchable, offset-labelled combobox with the detected zone pinned, and share one validator (try/catch constructing an Intl.DateTimeFormat) between both paths.
- **Done when:** Any IANA zone can be selected and saved by both students and teachers; a bogus zone is rejected identically on both paths; slot generation never throws on a stored zone.

### 🟠 `INT-03` Make timeZone required on the formatters and always render a zone label

- [x] **Effort:** M · 1–2 days · **Area:** timezone
- **Files:** `src/lib/format.ts`, `src/lib/timezone.ts`, `src/app/dashboard/page.tsx`, `src/server/notifications/notify.ts`
- **What:** formatDateTime's timeZone parameter is optional, so omissions silently fall back to the runtime zone (UTC on the host) — src/app/dashboard/page.tsx renders lesson times with no zone argument while /dashboard/bookings/[id] passes user.timezone, so the same lesson shows two different times in one session. Neither formatDateTime nor formatInTimeZone ever passes timeZoneName; a grep for timeZoneName across src/ returns zero results, so every lesson time in every email, notification, dashboard and booking page is an unqualified wall-clock string. That absence is the multiplier that makes every other timezone defect silent rather than self-correcting. Make the parameter required so the compiler enumerates every call site, add timeZoneName 'short', and sweep the omissions the compiler surfaces.
- **Done when:** The project compiles only after every call site supplies a zone; every displayed and emailed time carries a zone label; the dashboard and the booking detail page show the same time for the same lesson.

### 🟠 `INT-06` Anonymous visitors must not be shown South African time on the public booking page

- [x] **Effort:** M · 1–2 days · **Area:** booking-ux · **Blocked by:** INT-05
- **Files:** `src/app/teachers/[slug]/page.tsx`, `src/app/find-tutor/[slug]/page.tsx`, `src/features/bookings/components/slot-picker.tsx`
- **What:** `viewerTimeZone={user?.timezone ?? 'Africa/Johannesburg'}` on the primary public tutor page (find-tutor/[slug] is a straight re-export of it), so the entire top of the acquisition funnel evaluates a teacher's availability in SAST while the footnote confidently asserts 'Times shown in Africa/Johannesburg' — a prospective student in Los Angeles is shown times ten hours off with no selector to correct it short of creating an account and finding the settings page. Resolve the zone client-side from the browser for anonymous viewers (or fall back to UTC with an explicit label), and add a visible timezone selector above the tabs that any visitor can change, persisting to the user record when signed in. Never fall back to a specific populated region.
- **Done when:** A logged-out visitor in Los Angeles sees Pacific times labelled as such and can switch zones directly on the page without signing up.

### 🟠 `INT-07` Remove every hardcoded en-ZA locale and centralise Intl construction

- [x] **Effort:** M · 1–2 days · **Area:** locale
- **Files:** `src/lib/format.ts`, `src/lib/timezone.ts`, `src/features/bookings/components/slot-picker.tsx`, `src/app/teachers/[slug]/page.tsx`, `src/app/admin/analytics/page.tsx`, `src/server/teachers/analytics.ts`, `src/server/admin/platform-analytics.ts`, `eslint.config.mjs`
- **What:** Roughly 24 en-ZA literals across 11 files — Intl.DateTimeFormat('en-ZA') in format.ts, timezone.ts, the slot picker and the public teacher page, plus about a dozen toLocaleString('en-ZA') calls in the admin and teacher analytics pages. en-ZA is a 24-hour, day-first locale with non-breaking-space number grouping, so a US student never sees an AM/PM time; combined with INT-05 they see '03:00' under a tab labelled with the previous day and have no AM/PM anchor to notice the wrongness. Route everything through a single resolveLocale() helper in src/lib/format.ts (user's stored locale, else Accept-Language on the server, else undefined so Intl resolves the runtime locale), delete every inline literal, and add a lint rule banning locale string literals outside format.ts.
- **Done when:** Zero en-ZA occurrences outside format.ts; a US-locale browser sees AM/PM times and month-first dates; the lint rule fails a CI run if a locale literal is reintroduced.

### 🟠 `INT-08` Delete ZAR from lesson currencies and fix the index-based default

- [x] **Effort:** S · <½ day · **Area:** currency
- **Files:** `src/lib/currencies.ts`, `prisma/schema.prisma`, `scripts/test-payments.ts`, `docs/LessonPayments.md`
- **What:** ZAR is the FIRST entry in LESSON_CURRENCIES with providers ['paypal'], but PayPal does not support ZAR as a transaction currency at all — a ZAR-priced booking builds an order in an unsupported currency and fails at order creation, and scripts/test-payments.ts asserts the wrong behaviour as correct. getCurrencyMeta falls back to LESSON_CURRENCIES[1] BY INDEX, so reordering the array silently makes ZAR the default. prisma/schema.prisma:571 still defaults a currency column to ZAR (the only remaining ZAR default). For an international customer base ZAR should not be a lesson currency at all — the rand is the founder's settlement constraint, not a customer-facing currency. Remove the entry, replace the index fallback with an explicit lookup of 'USD' by code, migrate existing ZAR rows, and fix the test assertion and the docs line that lists it.
- **Done when:** No ZAR in LESSON_CURRENCIES or as a schema default; a unit test asserts every listed currency is supported by the active lesson rail; getCurrencyMeta('XXX') returns USD regardless of array order.

### 🟠 `INT-10` Add a teaching-language model and marketplace language filter

- [x] **Effort:** M · 1–2 days · **Area:** discovery
- **Files:** `prisma/schema.prisma`, `src/server/marketplace/teachers.ts`, `src/lib/validations/teacher-onboarding.ts`, `src/features/marketplace/components/teacher-filters.tsx`, `src/features/marketplace/components/teacher-card.tsx`
- **What:** A grep for languages, spokenLanguages or nativeLanguage across src/ and prisma/ returns zero hits — there is no language-of-instruction field anywhere. TeacherProfile carries bio, headline, rate, currency, intro video, subjects and qualifications; teacherOnboardingSchema never asks; and TeacherSearchFilters is {query, subject, maxRateCents, minRating, sort}. On Preply, italki and AmazingTalker language is the FIRST filter a student applies — for language tutoring it is the product, and for subject tutoring it determines whether the lesson is even possible. This is the highest-commercial-value gap on the international list, above any i18n work. Add a TeacherLanguage join (language code, CEFR-style proficiency, isNative), require at least one entry at onboarding, surface it on the teacher card and profile, and add a multi-select filter backed by an indexed query.
- **Done when:** A student can filter to teachers who teach in Spanish; every listed teacher displays at least one language; the filter runs in SQL rather than in-memory over a truncated slice.

### 🟠 `INT-12` Normalise hourly rates so the price filter and sort are coherent across currencies

- [x] **Effort:** M · 1–2 days · **Area:** discovery · **Blocked by:** INT-11
- **Files:** `src/server/marketplace/teachers.ts`, `prisma/schema.prisma`, `src/features/marketplace/components/teacher-filters.tsx`
- **What:** searchTeachers applies `hourlyRateCents <= maxRateCents` and sorts price_asc/price_desc on that same raw column, while TeacherProfile.currency varies per teacher across the full currency list and the filter UI labels are dollar-denominated ('Up to $50/hour'). So a teacher charging R450/hour (~$24) is excluded from the $50 bucket while a teacher at £45 (~$57) is included, and price sorting is meaningless. Add an hourlyRateUsdCents shadow column recomputed on profile save and on the scheduled FX refresh; filter and sort on it while continuing to display and charge in the teacher's native currency, which remains the source of truth for checkout.
- **Done when:** The 'Up to $50/hour' bucket contains exactly the teachers whose rate converts to $50 or less, and price sorting is monotonic in USD across mixed-currency teachers.

### 🟠 `INT-13` Capture user country and add restricted-jurisdiction and sanctions screening

- [x] **Effort:** M · 1–2 days · **Area:** compliance
- **Files:** `prisma/schema.prisma`, `src/app/register/page.tsx`, `src/lib/validations/auth.ts`, `src/actions/auth.ts`, `src/actions/teacher-onboarding.ts`, `src/actions/admin.ts`
- **Outcome:** Country captured at registration (defaulted from the browser zone), nullable in the column with a dashboard backfill prompt for older accounts. Jurisdiction checked at three gates — registration, teacher approval, payment linking — each recording a `ComplianceEvent`, which exists because `AdminAuditLog` requires an admin actor and a refused registration has none. **OFAC only: the EU consolidated feed is NOT implemented.** Every public entry point was checked on 2026-08-02 and the long-standing anonymous token endpoint now returns 500 for both CSV and XML, so the list sits behind a registered account; adding it as a source that cannot fetch would report "screened" while checking nothing. **Requires migration `20260802090000_int13_country_and_sanctions_screening` — NOT applied.** The restricted list is the four comprehensively sanctioned countries only: it deliberately omits the sectoral Russia/Belarus programmes and cannot express the sub-national Ukraine regions, both documented in `src/lib/compliance/restricted-jurisdictions.ts` pending the PRD-05 opinion.
- **What:** User has no country, region or residence field at all; TeacherPaymentAccount.country exists but is only ever read, never written; and there is no IP geolocation, no blocklist and no screening of any kind — the existing Sanction model is a moderation penalty issued by admins, not a trade-sanctions list, and a grep for OFAC, embargo or restricted-country logic returns nothing. Country is a prerequisite for payout eligibility (PAY-14), tax evidence (PAY-06) and the minors decision (PRD-04). Add a required ISO 3166-1 alpha-2 country at registration, defaulted from the detected timezone; maintain a restricted-jurisdiction blocklist checked at registration, teacher approval and payment-link setup; and screen teacher names against the free OFAC SDN and EU consolidated feeds at approval, recording the result on the profile for audit.
- **Done when:** Every new user has a country and existing users get a backfill prompt; registration and teacher approval from a blocked jurisdiction are refused with an audit record; a name matching an SDN entry holds approval for manual review.

### 🟡 `INT-09` Derive minor units per currency, then expand the settlement currency list

- [x] **Effort:** M · 1–2 days · **Area:** currency
- **Files:** `src/lib/payments/routing.ts`, `src/lib/currencies.ts`, `src/lib/format.ts`, `src/lib/validations/teacher-onboarding.ts`, `src/features/teacher-onboarding/components/profile-editor.tsx`
- **Outcome:** 19 currencies, up from 5. INR was NOT added — PayPal does not list it as a transaction currency at all, so it would repeat INT-08's ZAR incident; likewise BRL/CNY/MYR (PayPal in-country accounts only), HUF/TWD (PayPal and ISO 4217 disagree on the exponent) and RUB (no ECB rate). All are listed with their reason in `src/lib/currencies.ts` and should be revisited when the Stripe rail replaces PayPal. The exponent fix also corrected two conversions that had the same 100x assumption baked in: `toUsdCents` and `convertMinorUnits`, which ranked a ¥8,000 teacher at $0.50/hour. The country-based default pre-selection was not done — there is no country field on TeacherProfile to drive it.
- **What:** amountFromCents returns (cents / 100).toFixed(2) for every provider-facing amount. This is latent today because all six listed currencies are two-decimal, but adding JPY or KRW (zero-decimal) would submit an amount 100 times wrong to the provider — so order matters: fix the exponent first, expand second. Derive the minor-unit exponent per currency via Intl.NumberFormat resolvedOptions and format accordingly. Then expand the list beyond six currencies, which is far too narrow for an international teacher base (no JPY, INR, BRL, MXN, PHP, SGD, HKD, NZD, PLN, CHF, SEK), ordered USD/EUR/GBP first, with the teacher's country pre-selecting a sensible default.
- **Done when:** Unit tests cover a zero-decimal (JPY), two-decimal (USD) and three-decimal currency; a teacher in the Philippines can price in PHP and the exact amount reaches the provider.

### 🟡 `INT-11` Daily FX rate table with staleness alarms, plus indicative price conversion for students

- [x] **Effort:** M · 1–2 days · **Area:** currency
- **Files:** `prisma/schema.prisma`, `src/lib/currencies.ts`, `src/app/api/v1/jobs/expire-pending-payments/route.ts`, `vercel.json`, `src/features/marketplace/components/teacher-card.tsx`, `src/app/courses/[slug]/page.tsx`
- **What:** No exchange-rate or currency-conversion logic exists anywhere in src/ — the only rate in the codebase is the hand-maintained PAYFAST_USD_ZAR_RATE, which PAY-05 removes. A student in Japan browsing a UK teacher just sees '£25' with no idea what it costs them, and checkout never discloses the provider's FX spread. Add a cached daily rate table from a reference feed (ECB, exchangerate.host) refreshed by a new cron job with a staleness alarm rather than silently serving old numbers. One piece of infrastructure with two payoffs: it powers the rate normalisation in INT-12 and lets the marketplace render an unobtrusive secondary line — '£25/hr (≈ ¥4,700)' — using a viewer currency inferred from locale/timezone and overridable in settings, with the teacher's currency kept as the authoritative figure and the conversion labelled indicative.
- **Done when:** Rates refresh daily under the cron monitoring from QLT-04, a stale table raises an alert, and a viewer whose locale currency differs sees a labelled approximate conversion on the teacher card, profile and course page plus an FX-spread disclosure at checkout.

### 🟡 `INT-14` Fix teacher-local time handling in availability, day guards and analytics buckets

- [x] **Effort:** M · 1–2 days · **Area:** timezone · **Blocked by:** INT-01
- **Files:** `src/server/availability/slots.ts`, `src/actions/availability.ts`, `src/server/availability/schedule.ts`, `src/server/teachers/analytics.ts`, `src/server/admin/platform-analytics.ts`, `src/lib/timezone.ts`
- **Outcome:** All four parts done. The bucketing helpers were duplicated verbatim across the teacher and admin dashboards — the same UTC defect in two copies — so they were extracted to `src/server/analytics/buckets.ts` and both now take the viewer's zone. `slots.ts` needed no change: it was already zone-correct. Two follow-ups deliberately left: `formatInTimeZone` in `src/lib/timezone.ts` is dead code still hardcoding `en-ZA` (an INT-07 leftover), and `formatDate` in `src/lib/format.ts` renders without a `timeZone`, so it uses the server's zone — harmless today because no caller passes a date-only value, but the same class of bug one layer down.
- **What:** Three related teacher-local-time defects. (a) Availability windows are converted to UTC using user.timezone, which defaulted to SAST and is pre-selected in the onboarding wizard, so a teacher in London or Chicago who clicks straight through publishes 09:00-17:00 SAST — off by 1 to 8 hours, and the error is inherited by every slot, reminder and calendar export downstream; add an explicit 'times below are in Europe/London — change' confirmation on the availability screen and a backfill prompt for accounts still on the default. (b) The 'today' guards compare against UTC midnight (`specificDate < new Date(new Date().toISOString().slice(0,10))` and `DateTime.utc().startOf('day')`), so a teacher in Los Angeles at 17:00 local cannot block off their own remaining evening — precisely the emergency use case — and getTeacherSchedule filters `gte: new Date()` against the current instant rather than the teacher's local midnight. (c) Analytics bucket by getUTCFullYear/getUTCMonth and toISOString date keys, so lessons are attributed to the wrong calendar day and month boundaries land mid-day for anyone far from UTC. Also surface DST gap and ambiguity warnings from localDateTimeToUtc instead of silently shifting a nonexistent 01:30 to 02:30.
- **Done when:** An LA teacher can block their current evening; a London teacher sees their zone stated before saving availability; analytics day and month buckets match the viewer's own calendar; a DST-gap availability window produces a warning.

---

## P4 — Classroom rebuild

Keep LiveKit; rebuild the UI on top of it. See the decision brief for why switching vendors buys nothing.

<sub>6 tasks · 3 high · 3 medium</sub>

### 🟠 `VID-01` Choose the video platform for the classroom rework

- [ ] **Effort:** M · 1–2 days · **Area:** video
- **Files:** `src/services/livekit/client.ts`, `src/services/livekit/rooms.ts`, `src/services/livekit/tokens.ts`, `src/features/video/components/session-room.tsx`, `src/server/video/sessions.ts`
- **What:** The founder is explicitly open to switching video software. Evaluate staying on LiveKit Cloud against Daily (note src/services/daily/ already exists as an empty directory, suggesting an abandoned start), 100ms, Whereby Embedded and the Zoom Video SDK, scored on: global edge routing for cross-continent pairs (a single-region SFU is the wrong topology for a Brazil-India lesson), per-minute cost at expected volume, participant-joined/left webhooks needed for attendance and no-show attribution, recording plus storage and consent controls, built-in whiteboard/screen-share/chat primitives versus building them, breakout support for future group lessons, and the migration effort against the existing token, room and VideoSession model.
- **Done when:** A written comparison with a cost model at 1,000 and 10,000 lesson-minutes per month, a decision recorded, and the empty src/services/daily/ directory either populated or deleted.

### 🟠 `VID-02` Configure the SFU deliberately for cross-continent sessions

- [ ] **Effort:** S · <½ day · **Area:** video · **Blocked by:** VID-01
- **Files:** `src/features/video/components/session-room.tsx`, `src/services/livekit/client.ts`
- **What:** LiveKitRoom is mounted with only token, serverUrl, connect, audio and video — no options and no connectOptions, so adaptiveStream and dynacast (the two features that matter most when participants are on opposite sides of the planet with asymmetric bandwidth) are left at defaults rather than deliberately enabled. There is no videoCaptureDefaults resolution cap for long-haul sessions, no TURN/ICE configuration for restrictive corporate or campus networks, and no connection-quality indicator so neither party can tell that the link, rather than the teacher, is the problem. src/services/livekit/client.ts resolves a single LIVEKIT_URL with no region selection or geo-routing.
- **Done when:** adaptiveStream and dynacast explicitly enabled, capture resolution capped for long-haul sessions, a connection-quality indicator visible to both parties, and the deployment confirmed on globally edge-routed infrastructure rather than a single self-hosted region.

### 🟠 `VID-03` Record attendance and attribute no-shows correctly

- [ ] **Effort:** M · 1–2 days · **Area:** video · **Blocked by:** VID-01
- **Files:** `src/server/video/sessions.ts`, `src/actions/video.ts`, `src/actions/refunds.ts`, `src/lib/refunds/policy.ts`, `prisma/schema.prisma`
- **What:** Only the teacher can start a session, so a teacher who never clicks Start produces a 'no_show' even when the student waited in the lobby the whole hour — and nothing records WHO actually appeared. The student's only recourse is a refund request whose policyEligible is computed purely from the 24-hours-before-start rule (so always false after a no-show), and that request is then approved or declined by the very teacher who failed to appear, with the money already sitting in the teacher's own account because the platform holds nothing. Record participant-joined events from the provider's webhooks (or at join-credential issuance), distinguish teacher_no_show from student_no_show, auto-set policyEligible true for teacher no-shows and escalate them to admin moderation rather than routing them to the teacher, and track repeat no-show teachers for enforcement. This is also the input the trust controls in PAY-09 need.
- **Done when:** A session where only the student joined is recorded as teacher_no_show, the resulting refund request is policy-eligible and routed to admin, and the teacher's no-show counter increments toward an enforcement threshold.

### 🟡 `VID-04` Pre-join device check, lobby and reconnection handling

- [ ] **Effort:** M · 1–2 days · **Area:** video · **Blocked by:** VID-01
- **Files:** `src/features/video/components/device-preview.tsx`, `src/features/video/components/session-room.tsx`, `src/app/sessions/[id]/page.tsx`
- **What:** Extend the existing device-preview component into a real pre-join lobby: camera and microphone selection with a level test, a bandwidth probe with a warning when the connection is likely inadequate, and a 'waiting for your teacher' state so the student knows they are in the right place. Add explicit reconnection handling with a visible reconnecting state and an audio-only degradation path rather than a silent drop, which on a paid 1:1 lesson reads to the student as the teacher disappearing.
- **Done when:** Both parties pass a device check before joining; a simulated network drop shows a reconnecting state and either recovers or degrades to audio-only without ending the session.

### 🟡 `VID-05` Add in-lesson teaching tools to the classroom

- [ ] **Effort:** L · ~1 week · **Area:** video · **Blocked by:** VID-01
- **Files:** `src/features/video/components/session-room.tsx`, `src/app/sessions/[id]/page.tsx`, `prisma/schema.prisma`
- **What:** The classroom is currently a bare video room, which is the thinnest possible version of the product's core moment. Add the tools that make it a teaching surface: screen share with annotation, a shared whiteboard, in-session chat with file sharing, and lesson notes and homework that persist to the booking afterwards. The persistence half also serves the retention goal in PRD-07 — accumulated lesson history, notes and homework on the platform is the main thing a direct teacher-student payment relationship cannot replicate.
- **Done when:** A teacher can share their screen, draw on a shared whiteboard, send a file, and leave notes that both parties can see on the booking record after the lesson ends.

### 🟡 `VID-06` Session recording with consent capture and safeguarding controls

- [ ] **Effort:** L · ~1 week · **Area:** video · **Blocked by:** PRD-04
- **Files:** `src/features/video/components/session-room.tsx`, `src/server/video/sessions.ts`, `src/app/privacy/page.tsx`, `prisma/schema.prisma`
- **What:** Recording is the standard dispute-resolution and safeguarding mechanism for unsupervised 1:1 video, and the platform has none — which matters more under an architecture where the platform cannot claw back funds and must adjudicate he-said-she-said disputes on evidence. Define a recording policy (opt-in per party, or mandatory if minors are in scope), capture consent against the existing ConsentRecord model, store recordings with a defined retention limit and access control, expose them to the trust and moderation flow, and document the treatment in the privacy policy. Scope depends on the minors decision.
- **Done when:** A recorded session captures explicit consent from both parties, is retrievable only by the two parties and admins with an audit entry, appears in the moderation flow when a dispute is raised, and is deleted automatically at the retention limit.

---

## P5 — Tests, performance, operations

The money path has zero test coverage today. That is how the P1 bugs got in.

<sub>12 tasks · 5 high · 5 medium · 2 low</sub>

### 🟠 `QLT-01` Integration tests for the payment state machine

- [ ] **Effort:** L · ~1 week · **Area:** testing
- **PARTIAL.** The premise is stale: `confirm.test.ts` already covered confirmBookingPayment and confirmCoursePayment (11 tests — idempotency, amount/currency/merchant mismatch, cancelled-booking handling). Added 16 more for what genuinely had none: refund accumulation (never reduces the total, clamps above the charge, idempotent on replay), the expire-vs-confirm race in BOTH directions, and markAttemptFailed. **That last one found a real bug** — it called `recordPaymentEvent` and ignored the `created` flag its two siblings both check, so every provider retry of one failed payment re-wrote the attempt and sent the student another "payment failed" email. Fixed, with the notification gated separately since it sits outside the transaction. Written against state-machine INVARIANTS rather than PayPal's wire format so they survive PAY-08. **Still outstanding:** webhook-parser and return-route tests, the Serializable retry path, and the coverage thresholds the "done when" asks for.
- **Files:** `src/server/payments/confirm.ts`, `src/app/api/v1/webhooks/paypal/route.ts`, `src/app/api/v1/payments/paypal/complete/route.ts`, `vitest.config.ts`
- **What:** The entire suite is five files (production-verification, lifecycle, platform-analytics, course quality, email-outbox) and every one tests pure helpers — signature strings, cents conversion, refund-policy booleans, retry backoff, template escaping. Zero tests exercise confirmBookingPayment, confirmCoursePayment, applyRefundToAttempt or expireAbandonedPayments (438 lines of money-moving logic), the webhook parsers, or the return route — which is exactly where every critical finding lives. Add integration-style tests with a mocked Prisma client or a test database via DIRECT_URL covering: webhook replay and idempotency, amount/currency/merchant mismatch rejection, confirm-versus-expire ordering in both directions, capture-status handling, refund accumulation across partial refunds, and the Serializable retry path.
- **Done when:** Each of MON-01 through MON-11 has a test that fails before its fix and passes after; coverage thresholds are set for src/server/payments and src/app/api/v1/webhooks so regressions fail CI, which already runs vitest.

### 🟠 `QLT-02` Integration tests for the subscription lifecycle and the ITN handler

- [ ] **Effort:** M · 1–2 days · **Area:** testing
- **PARTIAL.** 53 tests added across `run-lifecycle.test.ts` (25), `payfast/route.test.ts` (24) and `actions/billing.test.ts` (4), covering every branching, state-mutating path the item names. Deliberately split by lifespan: **subscription-lifecycle INVARIANTS are covered** — grace transitions, dunning advancement, replay idempotency, double-extension/double-invoice prevention, and the rule that local state never runs ahead of the provider — because those hold for any provider and survive PAY-05. **PayFast WIRE FORMAT is deferred**, since it dies with the rail. Regression-tested: MON-12 (renewal keeps the org's own plan, resolves the plan by it, and only extends the period), MON-13 (both halves — CANCELLED retires the mandate; the lifecycle job then downgrades with no provider round-trip), MON-14 (no provider call and no grant when the price cannot be computed), MON-15 (the token-update path never clears past-due, because no money moved), MON-17 (missed-renewal watchdog starts grace once and does not restart it nightly), MON-20 (grace expiry lands on Free *active*, not blocked-as-cancelled), MON-21 and MON-25 lifecycle halves (complimentary expiry, trial expiry), plus duplicate ITN delivery, FAILED-while-already-in-grace, and per-organization failure isolation. All 16 fixes were re-broken one at a time to confirm the suite goes red on each. **Still outstanding:** MON-18 (ITN signature param string), MON-22 (sale price vs `recurring_amount`), MON-23 (SAST `billing_date`) and MON-24 (invoice currency) have no *new* regression test — all four are pure PayFast payload construction that PAY-05 deletes, and MON-18/MON-19 are already covered by the pre-existing `signature.test.ts` and `periods.test.ts`. MON-16 is itself deferred, so there is no fix to pin. MON-21's admin-side confirmation guard is untested. Separately: **MON-25 is ticked but neither branch of its "done when" happened** — `startPaidTrial` is still called from nowhere but `lifecycle.test.ts`, so the trial remains dead code while the docs still advertise it.
- **Files:** `src/server/billing/lifecycle.test.ts`, `src/server/billing/run-lifecycle.ts`, `src/app/api/v1/webhooks/payfast/route.ts`
- **What:** lifecycle.test.ts covers only pure date helpers — trial length, grace length, dunning stages, growth block. None of the branching, state-mutating code is tested: runSubscriptionLifecycle (trial end, cancel-at-period-end including the provider-cancel failure path, pending plan change with the FX fallback, grace expiry, dunning idempotency) or the ITN handler (period extension, COMPLETE/FAILED/CANCELLED branches, invoice creation, duplicate-ITN dedupe). Several criticals live precisely in these untested paths. Add integration-style tests with a mocked db and provider client for every branch.
- **Done when:** Each of MON-12 through MON-25 has a regression test, explicitly including a renewal ITN arriving after an in-place plan change, a duplicate ITN delivery, and an already-cancelled provider response.

### 🟠 `QLT-03` Production-strict environment validation

- [x] **Effort:** S · <½ day · **Area:** ops
- **Outcome:** Enforced at BOOT, not at build. `next build` also runs with NODE_ENV=production, so failing there would break any pipeline that compiles without production secrets while catching nothing a boot check does not — the check skips `phase-production-build`. Verified all three states end to end: production boot with an empty env refuses and lists 17 problems at once, the build phase and development both boot untouched. Payment credentials are required only when a rail is actually enabled, so a deploy is not blocked over a provider the platform is not using.
- **Files:** `src/lib/env.ts`, `src/app/api/v1/health/ready/route.ts`, `docs/Deployment.md`
- **What:** src/lib/env.ts is a genuine central zod schema, but DATABASE_URL, the Supabase keys, SUPABASE_SERVICE_ROLE_KEY, the payment credentials, RESEND_API_KEY, CRON_SECRET and the LiveKit vars are all optional with no production-mode strictness. A deploy missing DATABASE_URL builds and boots cleanly and only fails deep inside the first request that touches Prisma; a missing RESEND_API_KEY silently falls back to the console provider so real users receive no email; and the LEGAL_* variables default to '[REPLACE BEFORE LAUNCH: ...]' placeholders that will render to users. The require*Env helpers exist but cover only Supabase, LiveKit and Google, and they run at call time rather than at boot. Add a refinement that hard-fails when the environment is production and rejects placeholder legal values — env.ts already runs at module load, so this converts silent runtime failures into a failed deploy.
- **Done when:** A production build with a missing DATABASE_URL, a console email provider, or a placeholder LEGAL_* value fails at boot rather than at first request.

### 🟠 `QLT-04` Cron authorization hardening and job liveness monitoring

- [ ] **Effort:** S · <½ day · **Area:** ops
- **PARTIAL — the buildable half only.** Job check-in recording (`JobRun`, one row per job, updated in place), a registry pairing each job with its schedule and what breaks when it stops, staleness assessed from the last SUCCESS rather than the last attempt, and readiness now returning 503 when CRON_SECRET is absent in production or any job has stalled. A 401 deliberately does not count as a check-in — otherwise the monitoring would confirm the very outage it exists to catch. **STILL OUTSTANDING: verify the Vercel plan.** Hobby allows one cron per day; five of the six schedules need Pro. The requirement is documented in `src/server/jobs/registry.ts` and a test asserts the registry and vercel.json agree, but whether the jobs actually fire is an account question only the operator can answer. The email-outbox after-response trigger is not built either.
- **Files:** `src/lib/security/cron-auth.ts`, `src/lib/env.ts`, `vercel.json`, `src/app/api/v1/jobs/subscription-lifecycle/route.ts`, `src/app/api/v1/health/ready/route.ts`
- **What:** isCronAuthorized returns false whenever CRON_SECRET is undefined — correct fail-closed security, but the variable is optional, so a missing or mistyped value makes all four jobs return 401 forever with no alert: emails stop sending, abandoned payments never expire, grace periods and dunning never run, and nothing in the app monitors job execution (the readiness endpoint checks the database but not job liveness). Separately, vercel.json schedules jobs every 5 to 15 minutes, which requires a paid hosting plan — verify that or the jobs silently never fire. Fail readiness when the secret is absent in production, add check-in style monitors around each job so a stall pages the founder, and either confirm the plan or move the email-outbox drain to an after-response trigger with the cron as a backstop.
- **Done when:** A missing CRON_SECRET fails the readiness endpoint in production; a job that stops running raises an alert within one expected interval; the schedule requirement is documented and verified.

### 🟠 `QLT-06` Memoize the session and eliminate the per-request user write

- [x] **Effort:** M · 1–2 days · **Area:** performance
- **Outcome:** MEASURED on /admin/teachers by counting Prisma operations through the client extension — **before: 6 x User.findUnique + 3 x User.update; after: 1 x User.findUnique + 0 x User.update.** getAuthUser and getCurrentUser are both wrapped in React `cache()`; the update is now conditional on a field actually differing; and the user is fetched once WITH memberships, so the teacher-org backfill is decided from rows already loaded rather than a per-request `organizationMember.count`.
- **Files:** `src/server/auth/session.ts`, `src/app/dashboard/teacher/layout.tsx`, `src/app/admin/layout.tsx`
- **What:** getCurrentUser calls syncUserFromAuth on every invocation, which performs a findUnique plus an unconditional db.user.update writing email/name/avatarUrl — a write on every authenticated request that also bumps updatedAt — then a third query re-fetching the user with memberships; requireTeacher adds a legal-acceptance query. None of it is wrapped in React cache(), and call sites stack: the teacher dashboard layout calls requireTeacher() and then getCurrentUser() again, so a single page render performs the whole sequence twice (two writes, roughly eight queries) before the page's own data loads, across roughly 80 call sites. Wrap getCurrentUser in cache() so layout, page and actions in one request share the result, and make syncUserFromAuth compare-before-write or move the sync to the auth callback only.
- **Done when:** A teacher dashboard render performs one session resolution and zero user writes when nothing changed; query counts measured before and after are recorded in the PR.

### 🟡 `QLT-05` Add root and segment error boundaries

- [x] **Effort:** S · <½ day · **Area:** reliability
- **Outcome:** Root, global, dashboard and checkout boundaries added; the two existing ones (admin, teacher analytics) rewritten onto the same shared screen — both previously only `console.error`'d, so nothing a user hit ever reached the tracker. `global-error.tsx` deliberately avoids the shared component tree: whatever breaks a root layout is often a shared provider, and the error screen must not fail the same way as the page. Verified by throwing from temporary routes and watching root and dashboard render their own branded screens with working digests. **The capture is unproven end to end** — no `NEXT_PUBLIC_SENTRY_DSN` is set locally, so `Sentry.init` runs disabled and the call is a no-op; the code path and wiring are covered by tests, delivery is not.
- **Files:** `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/dashboard/error.tsx`, `src/app/admin/error.tsx`, `src/app/dashboard/teacher/analytics/error.tsx`
- **What:** Only two error.tsx files exist anywhere under src/app (admin and teacher analytics) and there is no root error.tsx or global-error.tsx. The action layer returns typed ActionResult failures for expected cases, but unexpected errors are deliberately thrown (bookings.ts rethrows after retry exhaustion, requireAuth throws UnauthorizedError) and any Prisma or network failure during a server-component render on /find-tutor, /courses, /dashboard or the checkout pages has no boundary — users see Next's unstyled production error screen with a digest, on the exact pages where trust matters most. Add a root error.tsx with reset() and a global-error.tsx that captures to the error tracker, plus boundaries for the dashboard and checkout segments with a branded retry.
- **Done when:** A thrown error in each of those segments renders a branded retry screen and produces a captured exception in the error tracker.

### 🟡 `QLT-07` Push course-catalog pagination and rating aggregation into SQL

- [x] **Effort:** M · 1–2 days · **Area:** performance
- **Outcome:** take/skip + separate count; ratingAverage/ratingCount/enrollmentCount denormalised onto Course with `recomputeCourseAggregates` as the single writer, called from all five places a review or enrollment changes; minRating and every sort moved into SQL; review lists bounded on both detail queries; sort indexes plus pg_trgm GIN indexes for the ILIKE search. Denormalisation was necessary rather than paginate-then-aggregate because minRating and sort=rating decide WHICH rows are on the page. QLT-12's app-side popularity sort is superseded — enrollmentCount already excludes revoked enrollments, so the planner can order by it. **The p95 benchmark against a seeded 5,000-course catalog was NOT run**: it means writing ~100k rows to the live database. Boundedness is proven structurally instead (take/skip present, no unbounded review include, count separate).
- **Files:** `src/server/courses/queries.ts`, `prisma/schema.prisma`
- **What:** searchPublishedCourses issues findMany with no take or skip, pulling for every published course its full approved-review list and active sale joins, then computes aggregates, filters minRating, re-sorts for rating and price, and only then slices the page in JavaScript; getPublishedCourseBySlug similarly loads all of a course's reviews unbounded. Text search is `contains` with insensitive mode across title, description, teacher name and subject name with no trigram or full-text index. At 5,000 courses averaging 20 reviews, every hit on the unauthenticated, crawler-visited /courses page pulls roughly 100k review rows over the pooled connection and discards all but 24, saturating the pool and degrading bookings and dashboards along with it. Add take/skip plus a separate count, denormalise ratingAverage/ratingCount/enrollmentCount onto Course updated when a review is moderated, and add a pg_trgm GIN or tsvector index.
- **Done when:** /courses issues a bounded query whose row count does not grow with catalog size; p95 latency is measured against a seeded 5,000-course catalog before and after.

### 🟡 `QLT-08` Paginate the teacher marketplace and fix the rating filter and sort

- [x] **Effort:** M · 1–2 days · **Area:** discovery
- **Outcome:** `take: 60` replaced with take/skip + count; ratingAverage/ratingCount denormalised onto TeacherProfile with `recomputeTeacherAggregates` as the single writer (review submitted, review moderated); minRating and the rating sort moved into SQL; pagination controls added to /find-tutor as links that preserve active filters, so they work without JavaScript and a crawler can follow them. Same pattern as QLT-07. **The 200-seeded-teacher verification was NOT run** — it means writing test data to the live database. Backfill consistency was checked instead (agrees, but only 1 profile and 0 reviews exist, so it is a weak signal), and every marketplace path was exercised.
- **Files:** `src/server/marketplace/teachers.ts`, `src/app/find-tutor/page.tsx`, `src/features/marketplace/components/teacher-filters.tsx`
- **What:** searchTeachers takes exactly 60 profiles ordered by submittedAt desc, then applies the minRating filter and the 'rating' sort in memory over only those 60, and neither the query nor the /find-tutor page has pagination. Once the platform approaches its stated Year-1 target of 500 teachers, teacher 61 onwards — the earliest-approved and likely best-reviewed — can never appear in the default listing, 'sort by rating' returns the top-rated among the 60 most recently submitted rather than the platform's best, and minRating can return an empty page while matching teachers exist. Teachers who cannot be found will churn from paid plans, which is the platform's only revenue. Add page or cursor parameters mirroring searchPublishedCourses, aggregate ratings before pagination (groupBy or a denormalised column on TeacherProfile), and render pagination controls.
- **Done when:** With 200 seeded teachers the rating sort returns the genuinely top-rated first and every teacher is reachable through pagination.

### 🟡 `QLT-09` Google Calendar sync durability and counterparty email disclosure

- [x] **Effort:** M · 1–2 days · **Area:** integrations
- **Outcome:** All three "done when" conditions met. The local BookingCalendarEvent row is now retained unless the remote returns ok/404/410, so a failed delete stays retryable instead of discarding the only copy of the event id; `CalendarConnection.needsReconnect` is set on refresh failure, cleared on success, and surfaced as a reconnect prompt on the bookings page; and the counterparty email is gone from both create and update — it is no longer even SELECTED, so it cannot be reintroduced by the next edit. Took the display-name route rather than two-sided opt-in: the summary already named the counterparty, so nothing is lost and no consent machinery is needed for a feature nobody asked for. **The retry outbox from the "What" text is deliberately deferred** — retaining the row is its precondition, and the scheduler belongs with QLT-04's job-liveness work.
- **Files:** `src/server/integrations/google-calendar.ts`, `src/actions/bookings.ts`, `src/server/payments/confirm.ts`, `prisma/schema.prisma`
- **What:** Two problems in one file. (a) Every sync call site is fire-and-forget with no retry queue and no reconciliation job: after payment it is only logged, after an accepted reschedule it is .catch(() => undefined), and in deleteEventForBooking the Google DELETE is swallowed but the BookingCalendarEvent row is deleted regardless — so a cancelled lesson lingers permanently on the teacher's calendar as busy time and the event id needed to clean it up is gone. Only delete the local row when the remote returns ok or 404, set a needsReconnect flag on CalendarConnection when token refresh fails and surface it in the connect card, and route sync failures through an outbox processed by the existing cron pattern. (b) Both the create and update paths write `attendees: [{ email: counterpart.email }]`, disclosing the student's email address into the teacher's Google Calendar and vice versa with no consent capture, and causing Google to send an invitation from the calendar owner's address — an unnecessary personal-data disclosure to a third-party processor for an EU user base. Use the display name in the summary and description instead, or gate attendee sync behind explicit two-sided opt-in.
- **Done when:** A failed remote delete retains the local row for retry; a token-refresh failure surfaces a reconnect prompt in the UI; no counterparty email address is written to a third-party calendar without explicit opt-in.

### 🟡 `QLT-10` Course Q&A is republished publicly without student consent

- [x] **Effort:** S · <½ day · **Area:** privacy
- **Outcome:** New `isPublic` column defaulting false, kept SEPARATE from `hidden` — that flag is the teacher/admin moderation control, and folding consent into it would mean restoring a moderated question also publishes one the student never agreed to share. Publication now requires `isPublic AND NOT hidden`. Students get an unticked opt-in at ask time plus publish/unpublish/delete on their own questions, scoped by `studentId` in the where clause rather than a separate guard. **Migration `20260802110000_qlt10_course_question_consent` is NOT applied, and it retroactively unpublishes all existing public Q&A** — that is intended (nobody consented) but it removes live content from SEO-indexed pages, so it is the user's call.
- **Files:** `src/server/courses/queries.ts`, `src/actions/course-quality.ts`, `src/features/courses/components/course-community.tsx`, `src/app/courses/[slug]/page.tsx`
- **What:** getPublishedCourseBySlug selects answered questions where hidden is false and the public sales page renders each question body verbatim under the reassurance 'Public answers omit student identity' — which covers the name but not the question text. On the authoring side the composer says only 'Ask the teacher about course material' and the success toast says 'Question sent to your teacher', while askCourseQuestion stores it with hidden false by default, so publication is the silent default. A student asking a personal question in a mental-health or personal-finance course finds it on an SEO-indexed public page with no control. Default hidden to true (or add an isPublic column defaulting false), require an explicit publish opt-in with clear copy in the composer, and give students delete and unpublish control over their own questions.
- **Done when:** A newly asked question never appears publicly unless the student ticks the opt-in; students can unpublish their own questions from the course community view.

### ⚪ `QLT-11` Remove dead scaffolding and the seed-domain coupling in marketplace queries

- [x] **Effort:** S · <½ day · **Area:** architecture
- **Outcome:** react-query removed (provider, dependency, PROJECT.md row), three empty stripe directories deleted, and the marketplace email-suffix filter replaced with `User.isDemo`, backfilled from the convention it replaces. **The `stripe` enum member is KEPT, not removed** — the spec allowed "removed or justified", and P2 is the migration TO Stripe, so dropping it means one migration to remove and another to re-add within weeks; the reasoning now lives in schema.prisma so it is not re-flagged as dead. **Requires migration `20260802120000_qlt11_demo_account_flag`: /find-tutor returns 500 until it is applied**, since the query filters on a column that does not exist yet.
- **Files:** `src/components/providers.tsx`, `package.json`, `src/services/stripe`, `src/server/marketplace/teachers.ts`, `prisma/schema.prisma`, `PROJECT.md`
- **What:** QueryClientProvider is mounted and @tanstack/react-query ships in the client bundle of every page, but a repo-wide search finds zero useQuery/useMutation/useInfiniteQuery call sites — the app is server components plus server actions plus router.refresh throughout, which is fine, but PROJECT.md's stack table still claims TanStack Query. Related dead scaffolding: src/services/stripe/ is an empty directory, the stripe callback and webhook route directories are empty, and `stripe` remains in the PaymentProvider enum. Separately, both searchTeachers and getTeacherBySlug filter with `user: { email: { not: { endsWith: 'teachingplatform.local' } } }`, coupling the hottest public queries to a seed-data naming convention: it costs a join condition on every marketplace request, silently hides any real user whose email matches, does nothing for demo data seeded under another domain, and defeats index-only strategies on the profile table. Replace with an explicit excludeFromMarketplace or isDemo boolean.
- **Done when:** The client bundle no longer contains react-query, the empty stripe directories are gone and the enum member is removed or justified for the new rail, marketplace queries no longer reference an email suffix, and PROJECT.md's stack table matches reality.

### ⚪ `QLT-12` Small correctness cleanups: enrollment social proof and the hidden booking lead time

- [x] **Effort:** S · <½ day · **Area:** correctness
- **Outcome:** Every enrollment `_count` now filters `revokedAt: null`, including the two admin ones the spec did not name — an unfiltered lifetime count had no clear consumer, and a moderator reading "50 enrolled" for a course with 40 revocations is misled exactly as a buyer is. The popular sort could not be fixed in place: Prisma cannot order by a FILTERED relation count, so it moved to the post-fetch sort beside rating and price, which QLT-07 will push into SQL together. `MIN_BOOKING_NOTICE_HOURS` is named and commented, and now drives the copy on both the availability screen and the slot picker.
- **Files:** `src/server/courses/queries.ts`, `src/server/availability/slots.ts`
- **What:** (a) getPublishedCourseBySlug selects `_count: { enrollments: true }` with no where clause, and the same unfiltered count drives the catalog card query and the 'popular' sort, while everywhere else the codebase carefully filters revokedAt: null. A course that sold 50 copies and refunded 40 still advertises '50 students enrolled' and ranks high in popular, actively promoting a course most buyers rejected. Add `where: { revokedAt: null }` to both _count selects and use the filtered relation for the popularity ordering. (b) `const now = DateTime.now().toUTC().plus({ hours: 2 })` silently enforces a 2-hour minimum booking notice; it is functionally timezone-safe but reads exactly like a mistaken 'convert to SAST (UTC+2)' conversion, with no constant, no comment, and no visibility to teachers or students (who just see 'no slots'). Extract MIN_BOOKING_NOTICE_HOURS with a comment next to LESSON_DURATION_MINUTES, surface it in the UI, and consider making it a per-teacher setting the way competitors expose 'advance notice' — otherwise someone will 'fix' the apparent offset bug and silently delete the policy.
- **Done when:** A course with 50 sales and 40 revocations advertises 10 enrolled and ranks accordingly; the lead time is a named, commented constant surfaced to users.

---

## P6 — Docs, legal, positioning

PROJECT.md still describes a South African market and a PayFast student-payment rail that never existed in code.

<sub>9 tasks · 1 critical · 5 high · 3 medium</sub>

### 🔴 `PRD-05` Commission the professional tax and regulatory opinion

- [ ] **Effort:** M · 1–2 days · **Area:** legal · **Blocked by:** external: tax practitioner engagement
- **Files:** `docs/PaymentsArchitecture.md`
- **What:** Get one professional opinion covering, specifically for the architecture chosen in PAY-01: (a) confirmation that the teacher-of-record lesson model — where the platform never accepts money from payers for on-payment to third parties — stays outside third-party-payment-provider and money-transmission territory in the founder's jurisdiction, including under the draft directive currently in circulation; (b) the platform's own VAT registration status and the zero-rating treatment of exported services now that customers are international; (c) the tax and exchange-control treatment of receiving course gross through a merchant of record, retaining 10%, and paying teachers abroad; (d) whether the 10% course commission changes the analysis in (a). Nothing produced by the audit passes is tax advice, and the current documentation's TPPP reasoning, while probably sound, has never been professionally tested.
- **Done when:** A written opinion on file covering all four questions, and the architecture document updated with any constraints or filing obligations it imposes.

### 🟠 `PRD-01` Rewrite the product documentation for the international market and the new payment architecture

- [ ] **Effort:** M · 1–2 days · **Area:** docs · **Blocked by:** PAY-01
- **Files:** `PROJECT.md`, `docs/Vision.md`, `README.md`, `docs/LessonPayments.md`, `docs/PayFast.md`, `TODO.md`
- **What:** The docs assert the opposite of the actual position and will cause the next round of work to re-derive the same wrong defaults: PROJECT.md:9 'built for the South African market first', :46 'Primary market: South Africa' with international relegated to secondary, docs/Vision.md:5 'starting in South Africa', and a Year-1 MRR target of 'R50,000' — a rand target for a USD-priced, internationally-sourced revenue base that is currently anchoring pricing and channel decisions. Several statements are also factually wrong about the code: PROJECT.md:68, :70, :121-123, :228 and :293 plus docs/Vision.md:29 all claim student-to-teacher payments run over 'PayFast or teacher's PayPal', which never existed in code (LessonPaymentProvider is the literal type 'paypal'), and PROJECT.md documents international teachers linking PayFast to receive payments — a flow that cannot exist, since a PayFast merchant account requires a registered SA business, an SA bank account and FICA verification with SA ID and proof of residence. Restate the position: international teachers and students, South-African-domiciled operating entity, settlement to a South African bank account. Delete every claim that PayFast handles student-to-teacher payments, redenominate the MRR target in USD, rewrite the payment sections around the PAY-01 architecture, retire docs/PayFast.md, and add an explicit note that 'South Africa' in this codebase means the founder's settlement constraint and not the market.
- **Done when:** No document claims an SA-first market or a PayFast student-to-teacher flow; the payment sections match the shipped architecture; grepping for 'R50,000', 'Primary market: South Africa' and 'PayFast or' returns nothing.

### 🟠 `PRD-03` Rebuild the privacy and data-protection posture for an international user base

- [ ] **Effort:** L · ~1 week · **Area:** legal
- **Files:** `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`, `src/app/dashboard/privacy/page.tsx`, `prisma/schema.prisma`
- **What:** The privacy policy leads with POPIA and mentions GDPR only in prose, frames cross-border transfer as processing 'outside South Africa', and points users to the SA Information Regulator first with EEA/UK authorities second. There is no Article 27 EU/UK representative, no published sub-processor list with transfer mechanisms, and no consent banner wired to the existing ConsentRecord model. Behind the policy, /dashboard/privacy is a single generic request queue over PrivacyRequest with no statutory response-deadline tracking (GDPR mandates one month), no machine-readable portability export, and no distinction between request types. Keep South African governing law if that is genuinely where the entity sits, but present POPIA and GDPR/UK-GDPR as parallel annexes rather than primary and secondary, and have a lawyer with EU consumer-marketplace experience review the governing-law clause against Rome I, which will not let SA law displace mandatory consumer protections in an EU student's home state.
- **Done when:** The privacy policy is jurisdiction-neutral with parallel annexes, an Article 27 representative is named, sub-processors and transfer mechanisms are published, PrivacyRequest tracks a statutory deadline with status SLAs, and a portability request produces a machine-readable export.

### 🟠 `PRD-04` Decide the minors question explicitly rather than leaving a checkbox

- [ ] **Effort:** M · 1–2 days · **Area:** policy · **Blocked by:** INT-13
- **Files:** `src/lib/validations/auth.ts`, `src/server/legal/acceptance.ts`, `src/app/privacy/page.tsx`, `prisma/schema.prisma`
- **What:** A single confirmedAdult checkbox is the entire age model while the platform runs unsupervised 1:1 video, and the privacy policy states every account holder is at least 18. There is no date of birth, no country, no parental-consent flow and no minor-specific safeguarding. This is a fork in the road, not a bug: either the platform excludes K-12 tutoring — the largest segment of the global tutoring market — or the checkbox is a fiction that parents and teenagers will routinely click through, leaving the founder personally exposed. Decide and implement: if adults-only, enforce it beyond a checkbox (date of birth at minimum) and say so prominently in acquisition; if minors are in scope, add DOB plus country, a parent/guardian account type that owns the booking and payment relationship, country-varying GDPR Article 8 consent ages, and safeguarding controls on video sessions (recording policy, reporting escalation, an enhanced background-check tier for teachers). Clicking through a checkbox while the policy denies minors exist is the worst of the three options.
- **Done when:** A written decision, the age model enforced in code to match it, acquisition and legal copy consistent with it, and the safeguarding scope for VID-06 defined.

### 🟠 `PRD-06` Rewrite the refund policy for the split architecture and add student trust signals

- [ ] **Effort:** M · 1–2 days · **Area:** trust · **Blocked by:** PAY-10
- **Files:** `src/app/refund-policy/page.tsx`, `src/features/marketplace/components/teacher-card.tsx`, `src/app/teachers/[slug]/page.tsx`, `src/app/dashboard/refunds/page.tsx`
- **What:** The refund policy currently states plainly that the platform 'cannot debit the teacher, reverse a teacher transaction, reimburse the student from platform funds, or guarantee that a refund will be paid'. That is legally honest and architecturally correct for lessons, but as a student proposition it reads as 'pay a stranger directly and we disclaim any ability to get your money back' — against competitors who hold funds in escrow and release after the lesson with a platform guarantee. Under the split architecture the policy must distinguish clearly between lessons (teacher of record, teacher-issued refunds, platform mediates only, backed by the attestation and dispute controls in PAY-09) and courses (platform/MoR is the seller, so refunds are platform-issued and enforceable). Additionally surface each teacher's refund track record and response time on their profile, and evaluate a small capped platform-funded first-lesson guarantee as a marketing cost — not escrow — to break the cold-start trust barrier.
- **Done when:** The policy accurately describes both flows and the recourse available in each; teacher profiles display a refund and response-time record; the first-lesson guarantee decision is documented either way.

### 🟠 `PRD-07` Build retention mechanics that direct payment cannot replicate

- [ ] **Effort:** L · ~1 week · **Area:** strategy
- **Files:** `src/app/dashboard/messages/page.tsx`, `src/actions/bookings.ts`, `src/actions/messaging.ts`, `prisma/schema.prisma`
- **What:** After a single lesson a student and teacher already have a direct payment relationship, an open chat channel and each other's names, and there is no contact-information detection or filtering in messaging, no lesson packages or bundles, no recurring-booking subscriptions and no trial-lesson mechanic — bookings are strictly one-off 60-minute slots. With zero lesson commission the platform loses nothing per transaction from disintermediation; the real failure mode is structural subscription churn once a teacher's book of business no longer needs the platform, and subscriptions are the only revenue. Build stickiness that a direct payment relationship cannot replicate: lesson packages and recurring weekly bookings with automatic reminders (the single biggest retention lever competitors use), reviews and profile ranking driven by completed on-platform sessions so leaving costs visibility, and student history, homework and notes that live on the platform (shared with VID-05).
- **Done when:** A teacher can sell a multi-lesson package and a recurring weekly slot; profile ranking is computed from completed on-platform sessions; lesson history and notes persist per student.

### 🟡 `PRD-02` Make binding contract text provider-neutral and remove the pre-launch reviewer note

- [ ] **Effort:** S · <½ day · **Area:** legal
- **Files:** `src/app/terms/page.tsx`, `src/app/teacher-agreement/page.tsx`, `src/app/refund-policy/page.tsx`, `src/features/legal/components/legal-document-page.tsx`
- **What:** 'PayFast' is baked into binding contract text on three live legal pages and will be factually wrong the day the subscription rail changes, forcing a fresh acceptance cycle. Replace processor brand names with a neutral phrase such as 'our subscription payment processor'. Separately, the shared legal document footer is currently shipping to real users a line stating the document 'must be reviewed by qualified South African counsel before launch' — remove it from production pages. Both are find-and-replace changes that should land before the migration, not after.
- **Done when:** No processor brand name appears in any legal page body; the counsel-review footer is absent from production; acceptance versioning is bumped once for the combined change rather than twice.

### 🟡 `PRD-08` Close the course marketplace commerce gaps

- [ ] **Effort:** L · ~1 week · **Area:** course-commerce
- **Files:** `src/actions/courses.ts`, `src/server/courses/queries.ts`, `src/app/courses/[slug]/page.tsx`, `src/app/teachers/[slug]/page.tsx`, `prisma/schema.prisma`
- **What:** The marketplace is missing pieces buyers and sellers expect: no course trailer or preview-video field, no bundles and no cart, no drip release for cohorts, no per-lesson resume position or playback-rate memory, no adaptive transcoding (a single un-transcoded MP4 per lesson buffers badly on mobile networks, which is most of the target market), and — most consequentially — the teacher's published courses are not surfaced on their tutor profile at all, so their existing tutoring students never discover them. That cross-sell between live lessons and courses is the one thing no pure course platform can copy. Prioritise: teacher storefront cross-link in both directions, course trailer, resume position, then bundles and cart.
- **Done when:** A teacher's published courses appear on their tutor profile and each course page links back to booking a live lesson with that teacher; courses support a trailer; students resume where they left off.

### 🟡 `PRD-09` Narrow the launch by supply geography and de-localise the public marketing surface

- [ ] **Effort:** M · 1–2 days · **Area:** marketing · **Blocked by:** PAY-14
- **Files:** `src/features/marketing/components/testimonials.tsx`, `src/features/marketing/components/subjects.tsx`, `src/features/marketing/components/faq.tsx`, `src/features/marketing/components/hero.tsx`, `prisma/seed.ts`, `docs/Vision.md`
- **What:** docs/Vision.md's own principle is 'ship the marketplace loop first, avoid LMS bloat until the core tutoring flow is proven', yet a full course marketplace, organizations and teams, a trust centre, analytics with CSV export and an email delivery console all shipped pre-launch while the core loop does not work end to end. Narrow the launch — but the narrow axis is supply-side geography and language (the countries where teachers can actually be paid under PAY-14), not subject matter. Simultaneously de-localise the public surface: all three testimonials are South African ('Mathematics tutor, Johannesburg', 'Parent, Stellenbosch', 'Academy owner, Cape Town') and one uses 'improved a full symbol this term', a matric grading idiom meaningless outside South Africa; the six-tile hero subject grid puts Afrikaans alongside Mathematics and English; and the public FAQ names PayFast to prospective international teachers. The seeded subject catalogue is CAPS-weighted (Life Orientation, Life Sciences, Physical Sciences, all eleven SA official languages) with no Tagalog, Indonesian, Vietnamese, Polish, Romanian or Czech, and no SAT/ACT/AP/GCSE/A-Level/IB exam prep despite IELTS/TOEFL already being present.
- **Done when:** A geographically mixed testimonial cast with internationally legible phrasing, no processor named in public copy, a subject catalogue covering the major world languages and target-market exam-prep tracks, and a written launch-scope decision naming which surfaces are feature-flagged off for v1.

---

## Decisions still open

| # | Question | Recommended default |
|---|---|---|
| 1 | Do courses ship in v1, or after lessons work? | **After.** The course rail carries the whole legal stack, a publisher-contract rewrite, a 2–6 week MoR underwriting cycle, and earns ~$3.33 on a $40 sale. Launch lessons + subscriptions; keep course features dark. |
| 2 | Accept being the *publisher* of courses (teachers become licensors on a 90% royalty)? | **Yes.** It is the only framing an MoR will underwrite, and the defence against TPPP characterisation under SARB Directive 1 of 2007. |
| 3 | Take the 10% on courses? | **Yes.** Deemed-supplier liability attaches to hosting the content, not to the cut. |
| 4 | Comfortable holding thousands of teachers' live Stripe keys? | **Yes, with KMS envelope encryption and payout-excluded key scopes** — but this is a real risk being accepted, not a detail. |
| 5 | Does PayPal stay as a last-resort tier? | **Yes.** Already built. Deleting it costs teacher countries that no other combination reaches — Philippines, Vietnam, Pakistan, Bangladesh, Egypt, most of LatAm. |
| 6 | Which regional PSPs after Stripe? | **Decide from data.** Instrument teacher signups by country for one month first. |
| 7 | Offshore company to unlock Stripe Connect? | **No, not now.** SARS place-of-effective-management likely makes it SA tax resident anyway; Form 5472 carries a $25,000 penalty Stripe Atlas does not file for you. Revisit above ~$50k/yr. |
| 8 | Register for DAC7? | **Yes — and it bites the lessons side too.** As a non-EU platform facilitating personal services for EU-resident sellers, registration in one member state and annual seller reporting is required *even though you take no money on lessons.* |
| 9 | Who writes the teacher terms making lesson tax liability explicit? | **A lawyer, before launch.** |

## Suggested sequence

- **Week 1** — Send the five emails. Fix the five P4 Phase-0 classroom bugs (1–2 days, stops real losses today).
- **Weeks 2–3** — Subscription MoR migration. Own revenue, smallest build, kills the FX-constant bug, retires the hand-rolled dunning logic.
- **Weeks 4–7** — Stripe BYOK lesson rail + confirmation layer. First commit widens `LessonPaymentProvider` in `src/lib/currencies.ts:11`, currently the single string literal `"paypal"` — the *type* is the blocker, not config.
- **Weeks 8–12** — Classroom rebuild: LiveKit webhooks, Excalidraw whiteboard, persisted chat, notes and homework.
- **After launch, on evidence** — regional PSP #1 and #2, then courses.

Realistically 3–4 months of solo development, with legal and provider lead times running in parallel.

## A note on effort estimates

`S` / `M` / `L` / `XL` are relative sizes for one developer who knows this codebase, not calendar
promises. The distribution across all 110 tasks is
43×S, 54×M, 9×L, 4×XL.
