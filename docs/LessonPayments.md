# Lesson Payments

## Scope

Lesson payments go **directly to teachers**. Amazing Skills charges **no commission**.
Provider processing fees still apply.

| Provider | Role | Currencies |
|----------|------|------------|
| PayFast | South African ZAR teachers (Apple Pay + Google Pay on hosted checkout) | ZAR |
| PayPal Complete Payments | Eligible global teachers | USD, EUR, GBP, AUD, CAD, ZAR |
| Skrill | Deferred | — |
| Wise | Not used for checkout (payouts/transfers only) | — |

Platform subscriptions remain on PayFast (`docs/PayFast.md`).

---

## Approval checklist (before enabling flags)

1. **PayFast Split Payments**
   - Enable Split Payments under Settings → Integration
   - Confirm zero-platform-commission (100% split to teacher merchant) is allowed
   - Enable Apple Pay and Google Pay in the PayFast dashboard
2. **PayPal marketplace / partner**
   - Apply for PayPal Complete Payments Platform partner approval
   - Configure Partner Referrals, BN code, webhook ID
3. Set credentials in `.env.local`, then flip:
   - `LESSON_PAYMENTS_PAYFAST_ENABLED=true`
   - `LESSON_PAYMENTS_PAYPAL_ENABLED=true`

Do **not** enable a flag until sandbox onboarding + checkout + webhook succeed.

---

## Teacher currency

Teachers choose a settlement currency on their profile (`ZAR`, `USD`, `EUR`, `GBP`, `AUD`, `CAD`).
Bookings snapshot amount + currency; checkout only offers providers that support that currency and that the teacher has onboarded.

---

## Student flow

```
1. Student books slot → Booking pending_payment + PaymentAttempt pending (expires in LESSON_PAYMENT_TIMEOUT_MINUTES)
2. Student chooses an enabled provider on /dashboard/bookings/[id]
3. Hosted checkout (PayFast / PayPal)
4. Provider webhook verifies signature, amount, currency, merchant
5. PaymentAttempt → succeeded; Booking → confirmed; LiveKit room provisioned
6. Abandoned attempts expire; slot is released
```

Webhooks:

- `POST /api/v1/webhooks/payfast` — also handles lesson ITNs (m_payment_id / custom_str1)
- `POST /api/v1/webhooks/paypal`

---

## Local sandbox

```bash
# .env.local excerpts
LESSON_PAYMENTS_PAYFAST_ENABLED=true
LESSON_PAYMENTS_PAYPAL_ENABLED=true
PAYFAST_SANDBOX=true
PAYPAL_ENVIRONMENT=sandbox
NEXT_PUBLIC_APP_URL=https://your-ngrok-host  # required for live-like redirects
```

Use provider sandboxes for teacher onboarding and a test student checkout end-to-end.
