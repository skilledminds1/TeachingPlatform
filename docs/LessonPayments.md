# Lesson payments

Students pay teachers **directly**. Amazing Skills never receives, holds, routes or refunds
that money, and takes no commission on it. The platform's only revenue is the teacher
subscription (see [PayFast.md](PayFast.md)).

## How it works

1. A teacher saves a **payment link** from their own payment provider on
   `/dashboard/teacher/payments`.
2. A student books a lesson. The teacher accepts it — that is what confirms the lesson and
   provisions the video room. Nothing waits on money.
3. The booking page shows the student a **Pay your teacher** button that opens the teacher's
   link, alongside the destination host and a short booking reference.
4. When the payment arrives, the teacher marks it received. That is an annotation: it unlocks
   nothing, blocks nothing, and ranks nothing.

## Why the platform holds no keys

Every regime examined draws the line at **possession of funds**. SARB Directive 1 of 2007
defines a beneficiary service provider as one who "accepts money … on behalf of a
beneficiary"; PSD2 Art 3(j) excludes technical service providers that never come "into the
possession of the funds". A platform that accepts nothing is outside both. The moment lesson
money transits a platform-controlled balance — even briefly, even "for convenience" — that
stops being true and the whole model needs escrow, licensing and a different company.

## The link allowlist

`src/lib/payments/payment-links.ts` holds the permitted hosts. A link is stored, then rendered
as an `href` on a page carrying the platform's branding, so it is constrained to an **exact
host**, https only, **parsed rather than string-matched**: `buy.stripe.com.evil.com` passes a
`startsWith` check, and `https://buy.stripe.com@evil.com` parses with hostname `evil.com`
while a human reads Stripe. Both are refused, and both have tests.

**Only regulated hosted checkouts are accepted.** Bank details, wallet handles (Pix keys, UPI
ids, M-Pesa numbers) and PayPal friends-and-family links are refused deliberately: they carry
no chargeback, no dispute path, no receipt and no KYC on the payee, so a defrauded student has
no remedy and the platform can offer none. Requiring a PSP's hosted page outsources KYC and
dispute handling to that PSP, which is the strongest anti-abuse control this design has.

Adding a provider means verifying its checkout hostname against a real link first. A wrong
host fails safe — a legitimate link is rejected — whereas a missing constraint fails open.

## Changing a link

Setting the **first** link is immediate. **Changing** a live one requires confirmation from
the teacher's email, and the old link keeps working until then. A saved payout destination is
the highest-value target on a stolen teacher session, and SEC-02 found exactly this defect in
the old PayPal callback, where one crafted GET rewrote where a teacher's money went.

## Refunds

Between the student and the teacher. The platform records the request, the teacher's response,
and a free-text reference the teacher pastes from wherever they actually sent the money. It
cannot verify any of that and does not claim to. See `/refund-policy`.

## Attestation, and the invariant under it

A teacher marking a payment received is somebody's word, and that is fine **because lessons
are 0% commission**. On a marketplace that takes a cut, a teacher who under-reports saves
money and their word is worthless. Here, misreporting buys nothing.

**If a commission on lessons is ever introduced, this model collapses the same day** and the
platform is back to needing escrow. Confirmation runs off teacher acceptance and completion
off attendance in the video room — facts the platform owns — precisely so that no money claim
is load-bearing.

## What was deleted

The PayPal partner/multiparty rail: platform-brokered order creation and capture, the
partner-referral onboarding, the webhook, `PaymentAttempt`, `PaymentEvent`, `PaymentDispute`
and `TeacherPaymentAccount`. It required a partner approval, was gated off so no student could
ever reach it, and carried a one-click payout-repointing defect. Nothing was migrated because
no payment ever succeeded through it.
