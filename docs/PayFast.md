# PayFast Integration

## Scope

**PayFast is used for:**

1. **Platform subscriptions** — teachers paying Amazing Skills for Starter, Professional, or Business plans.

Student lesson payments use **PayPal** only (`docs/LessonPayments.md`).

---

## Subscription Flow

```
1. Teacher selects plan on /settings/billing
2. Server creates PayFast subscription request with merchant credentials
3. Teacher redirected to PayFast hosted payment page
4. PayFast processes recurring billing
5. ITN (Instant Transaction Notification) webhook hits /api/v1/webhooks/payfast
6. Server verifies signature, updates Organization.subscriptionStatus
7. Feature gates applied immediately on success
```

---

## Environment Variables

```bash
PAYFAST_MERCHANT_ID=       # Server-only
PAYFAST_MERCHANT_KEY=      # Server-only
PAYFAST_PASSPHRASE=        # Server-only
PAYFAST_SANDBOX=true       # true in dev/staging
PAYFAST_USD_ZAR_RATE=       # Maintained conversion rate used to create ZAR subscriptions
NEXT_PUBLIC_PAYFAST_MERCHANT_ID=  # Public merchant id for form generation if needed
```

Never commit live credentials. Sandbox for development.

---

## Webhook — ITN Handler

**Route:** `POST /api/v1/webhooks/payfast`

### Verification (required on every ITN)

1. Receive POST body from PayFast
2. Reconstruct parameter string
3. Verify MD5 signature with passphrase
4. Optionally confirm with PayFast server (`validate` ping)
5. Reject if signature invalid — return 400, do not process

### Events to handle

| ITN payment_status | Action |
|--------------------|--------|
| COMPLETE | Activate/renew subscription |
| FAILED | Mark past_due; start grace period |
| CANCELLED | Downgrade to Free at period end |

Always respond `200 OK` to PayFast after processing (or queued).

---

## Plan Mapping

| Plan | USD catalog price | Billing |
|------|-------------------|---------|
| Starter | $9 / $90 | Monthly / annual |
| Professional | $19 / $190 | Monthly / annual |
| Business | $39 / $390 | Monthly / annual |

Amounts are stored in `Plan.monthlyPriceCents` and `Plan.annualPriceCents` with currency `USD`. PayFast receives a ZAR amount calculated with `PAYFAST_USD_ZAR_RATE`; Multi-Currency Pricing can let the customer view USD, while settlement remains ZAR.

---

## Subscription States

```
active → past_due → cancelled → free
```

There is no trial. New teachers land directly on Free and upgrade by checking out.
`startPaidTrial` was removed in MON-25: it had no caller in any registration, checkout
or admin flow, so the 14-day trial this table used to advertise never existed in the
product. The `trialing` enum value survives only for legacy rows.

| State | Platform behavior |
|-------|-------------------|
| active | Plan features enabled |
| past_due | 7-day grace; warn user |
| cancelled | Active until period end, then Free |
| free | Free plan limits |

---

## Feature Gates

Central services: `src/server/billing/entitlements.ts` and `src/server/billing/student-access.ts`

| Check | Free | Starter | Professional | Business |
|-------|------|---------|--------------|----------|
| Active students | 1 | 5 | 15 | Unlimited |
| Live lesson hours / month | 2 | 20 | 75 | Unlimited (fair use) |
| Courses | 1 | Unlimited | Unlimited | Unlimited |
| Homework and notes | ✗ | ✓ | ✓ | ✓ |
| Quizzes and groups | ✗ | ✗ | ✓ | ✓ |
| Team and branding | ✗ | ✗ | ✗ | ✓ |

Call the entitlement service before every gated feature. Booking creation atomically reserves live-lesson minutes and enforces both the organization hour pool and active-student limit.

---

## Security

- All PayFast credentials server-only
- ITN signature verification mandatory — never skip in dev
- Idempotent webhook processing (store `payfastPaymentId` to dedupe)
- Log ITN events without card data

---

## Sandbox Testing

- Use PayFast sandbox credentials in staging
- Test cards documented in PayFast developer docs
- Verify ITN reaches staging URL (ngrok or staging deploy)

---

## What PayFast Does NOT Do

- Process student payments to teachers
- Hold escrow or disburse teacher earnings
- Handle PayPal teacher accounts

See Phase 7 teacher payment docs in [Features.md](Features.md).
