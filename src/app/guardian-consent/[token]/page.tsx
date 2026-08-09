import type { Metadata } from "next";
import Link from "next/link";

import { GuardianConsentForm } from "@/features/guardians/components/guardian-consent-form";
import { GuardianWithdrawForm } from "@/features/guardians/components/guardian-withdraw-form";
import { lookupGuardianConsent } from "@/server/guardians/consent";

export const metadata: Metadata = {
  title: "Permission for a young learner",
  // A permission link is a private URL. Keep it out of any index.
  robots: { index: false, follow: false },
};

/**
 * The guardian's page. No account, no sign-in — the token in the URL is the credential.
 *
 * It states what is being agreed to before the button, rather than after, because consent
 * given without knowing what it covers is not consent. That includes the two things this
 * platform genuinely cannot promise: it does not hold the lesson money, and it does not
 * background-check teachers.
 */
export default async function GuardianConsentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const consent = await lookupGuardianConsent(token);

  return (
    <main id="main-content" className="mx-auto max-w-2xl px-6 py-12 md:py-16">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        Permission for a young learner
      </h1>

      {!consent.ok && consent.reason === "already_verified" ? (
        <div className="mt-6 space-y-4">
          <section className="space-y-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-6">
            <p className="font-medium">You have given permission for {consent.minorName}</p>
            <p className="text-sm text-muted-foreground">
              They can book lessons. Keep this email — it is also how you withdraw permission.
            </p>
          </section>
          <GuardianWithdrawForm token={token} minorName={consent.minorName} />
        </div>
      ) : null}

      {!consent.ok && consent.reason !== "already_verified" ? (
        <div className="mt-6 space-y-4 rounded-xl border border-border bg-card p-6">
          <p className="font-medium">
            {consent.reason === "revoked"
              ? "This permission has been withdrawn."
              : consent.reason === "expired"
                ? "This permission link has expired."
                : "This permission link is not valid."}
          </p>
          <p className="text-sm text-muted-foreground">
            Ask the student to send a new request from their dashboard. Links expire so that an
            old email cannot be used later.
          </p>
          <Link href="/" className="text-sm font-medium text-primary hover:underline">
            Go to Amazing Skills
          </Link>
        </div>
      ) : null}

      {consent.ok ? (
        <div className="mt-6 space-y-6">
          <section className="space-y-3 rounded-xl border border-border bg-card p-6">
            <p>
              <span className="font-medium">{consent.minorName}</span> has created a student
              account and named you as their {consent.relationship.toLowerCase()}.
            </p>
            <p className="text-sm text-muted-foreground">
              Until you give permission, this account cannot book a lesson.
            </p>
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card p-6">
            <h2 className="font-heading text-lg font-semibold">What you are agreeing to</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                {consent.minorName} may book and attend live one-to-one video lessons with
                independent teachers listed on Amazing Skills.
              </li>
              <li>
                Lessons happen in a private video room between the student and that teacher.
              </li>
              <li>
                We process their name, email address, date of birth, timezone, bookings and
                lesson history to run the service. Our{" "}
                <Link href="/privacy" className="font-medium text-primary hover:underline">
                  Privacy Policy
                </Link>{" "}
                sets out the detail, including how to ask for their data or its deletion.
              </li>
              <li>
                You can withdraw permission at any time, which stops further bookings.
              </li>
            </ul>
          </section>

          <section className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-6">
            <h2 className="font-heading text-lg font-semibold">
              What we do not do — please read
            </h2>
            <ul className="space-y-2 text-sm">
              <li>
                <span className="font-medium">We do not handle the money.</span> Students pay
                teachers directly through the teacher&apos;s own payment account. Amazing Skills
                never holds that payment and cannot refund it — refunds are between you and the
                teacher.
              </li>
              <li>
                <span className="font-medium">
                  We do not carry out criminal record or background checks on teachers.
                </span>{" "}
                We review each profile for qualifications and completeness before it is listed.
                That is a quality check, not a safeguarding check, and you should satisfy
                yourself about any teacher your child works with.
              </li>
              <li>
                <span className="font-medium">Lessons are not recorded or monitored.</span>{" "}
                Nobody from Amazing Skills attends the video room.
              </li>
            </ul>
          </section>

          <GuardianConsentForm token={token} minorName={consent.minorName} />
        </div>
      ) : null}
    </main>
  );
}
