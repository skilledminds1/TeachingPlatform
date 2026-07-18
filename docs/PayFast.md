# PayFast Integration

## Scope

**PayFast is used for platform subscriptions only** — teachers paying TeachingPlatform for Pro/Academy plans.

PayFast is **NOT** used for student→teacher session payments. Those use the teacher's linked **PayPal** or **Stripe** account.

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

| Plan | PayFast recurring amount | Frequency |
|------|--------------------------|-----------|
| Pro | R299.00 | Monthly |
| Academy | R799.00 | Monthly |
| Pro (annual) | R2,990.00 | Annual |
| Academy (annual) | R7,990.00 | Annual |

Amounts stored in `Plan.priceCents`. PayFast amounts in ZAR decimal strings.

---

## Subscription States

```
trialing → active → past_due → cancelled → free
```

| State | Platform behavior |
|-------|-------------------|
| trialing | Full Pro features; 14 days |
| active | Plan features enabled |
| past_due | 7-day grace; warn user |
| cancelled | Active until period end, then Free |
| free | Free plan limits |

---

## Feature Gates

Central service: `src/server/billing/check-plan-limit.ts`

| Check | Free | Pro | Academy |
|-------|------|-----|---------|
| Marketplace listing | ✗ | ✓ | ✓ |
| Video sessions | ✗ | ✓ | ✓ |
| Active students | 5 | 50 | 250 |
| Link PayPal/Stripe | ✗ | ✓ | ✓ |

Call before: new booking enrollment, profile submission, video room creation.

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
- Handle PayPal/Stripe teacher accounts

See Phase 7 teacher payment docs in [Features.md](Features.md).
