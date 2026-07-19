# Lesson Payments

## Scope

Lesson payments go **directly to teachers** via **PayPal**. Amazing Skills charges **no commission**.
Provider processing fees still apply.

| Provider | Role | Currencies |
|----------|------|------------|
| PayPal Complete Payments | Eligible teachers worldwide | ZAR, USD, EUR, GBP, AUD, CAD |

**PayFast is not used for student lesson payments.** PayFast is only for teacher platform subscriptions (`docs/PayFast.md`).

---

## Approval checklist (before enabling flags)

1. **PayPal marketplace / partner**
   - Apply for PayPal Complete Payments Platform partner approval
   - Configure Partner Referrals, BN code, webhook ID
2. Set credentials in `.env.local` / Vercel, then flip:
   - `LESSON_PAYMENTS_PAYPAL_ENABLED=true`

Do **not** enable the flag until sandbox onboarding + checkout + webhook succeed.

---

## Teacher currency

Teachers choose a settlement currency on their profile (`ZAR`, `USD`, `EUR`, `GBP`, `AUD`, `CAD`).
Bookings snapshot amount + currency; checkout requires the teacher to have linked PayPal.

---

## Student flow

```
1. Student books slot → Booking pending_payment + PaymentAttempt pending (expires in LESSON_PAYMENT_TIMEOUT_MINUTES)
2. Student pays with PayPal on /dashboard/bookings/[id]
3. Hosted PayPal checkout
4. Provider webhook verifies signature, amount, currency, merchant
5. PaymentAttempt → succeeded; Booking → confirmed; LiveKit room provisioned
6. Abandoned attempts expire; slot is released
```

Webhook: `POST /api/v1/webhooks/paypal`

---

## Local sandbox

```bash
# .env.local excerpts
LESSON_PAYMENTS_PAYPAL_ENABLED=true
PAYPAL_ENVIRONMENT=sandbox
NEXT_PUBLIC_APP_URL=https://your-ngrok-host  # required for live-like redirects
```

Use PayPal sandbox for teacher onboarding and a test student checkout end-to-end.
