import { ExternalLink } from "lucide-react";

/**
 * The student's route to paying their teacher.
 *
 * COPY DISCIPLINE MATTERS MORE THAN THE MARKUP HERE. The platform does not process, hold,
 * check or stand behind this payment, so the panel must not describe it as secure, verified,
 * protected, or backed by any assurance. That language is what turns a redirect into a
 * representation, and a representation into liability the zero-touch model cannot carry.
 *
 * The exact banned phrases live in src/lib/payments/payment-links.test.ts, which scans this
 * directory for them — deliberately listed there rather than here, so that quoting the rule
 * does not trip it.
 *
 * The destination host is shown next to the button so the student sees where they are going
 * before they go, which is the one anti-phishing control available when the destination is
 * chosen by someone else.
 */
export function PayYourTeacherPanel({
  teacherName,
  paymentLinkUrl,
  paymentLinkHost,
  reference,
  amountLabel,
}: {
  teacherName: string;
  paymentLinkUrl: string | null;
  paymentLinkHost: string | null;
  reference: string;
  amountLabel: string;
}) {
  if (!paymentLinkUrl || !paymentLinkHost) {
    return (
      <div className="rounded-lg border border-border bg-background/60 p-4 text-sm">
        <p className="font-medium">{teacherName} has not set up payments yet</p>
        <p className="mt-1 text-muted-foreground">
          Message them to agree how to pay. Your lesson is booked either way.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background/60 p-4">
      <div>
        <p className="font-medium">Pay {teacherName} directly</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {amountLabel} — you pay {teacherName} through their own payment provider. Amazing
          Skills never handles this money and cannot refund it; refunds are between you and
          your teacher.
        </p>
      </div>

      <a
        href={paymentLinkUrl}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Pay your teacher
        <ExternalLink className="size-4" aria-hidden />
      </a>
      <p className="text-xs text-muted-foreground">
        This opens {paymentLinkHost}, which is {teacherName}&apos;s payment provider — not
        Amazing Skills. Check the address matches before entering card details.
      </p>

      <div className="rounded-md bg-muted/50 p-3">
        <p className="text-xs font-medium">Add this reference to your payment</p>
        <p className="mt-1 font-mono text-sm">{reference}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          It helps your teacher match the payment to this lesson.
        </p>
      </div>
    </div>
  );
}
