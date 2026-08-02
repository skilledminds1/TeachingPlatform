/**
 * Defects that must be fixed before the PayPal lesson rail may ever be switched on.
 *
 * WHY THIS EXISTS AS CODE RATHER THAN A NOTE.
 *
 * MON-01 and MON-04..06 are recorded as done in the backlog because they were deliberately
 * closed as won't-fix-here: the Stripe rail deletes these handlers, and repairing a handler
 * we intend to delete is throwaway work. That reasoning is sound while the rail stays off —
 * and the ONLY thing keeping it off is `LESSON_PAYMENTS_PAYPAL_ENABLED` defaulting to
 * "false". A single environment variable, in a dashboard, one click from a double charge.
 *
 * The defects are real money bugs, not cosmetic. MON-01 alone means a student who opens
 * checkout twice can approve both orders and be charged twice for one lesson.
 *
 * So the flag is no longer sufficient on its own. While this list is non-empty the rail
 * cannot enable no matter what the environment says, and the only way to lift the block is
 * to delete entries from this file — a code change that goes through review, rather than a
 * config toggle made at speed by someone who was not in the room when these were found.
 *
 * TO ENABLE THE RAIL: fix a defect, delete its entry here, delete the matching
 * "KNOWN DEFECT" comment in the route. When the list is empty the flag works as written.
 */
export type PayPalRailDefect = {
  /** Backlog id. */
  id: string;
  /** Where the defect lives, so the list cannot drift from the code. */
  file: string;
  /** What goes wrong in terms of money or access, not in terms of code shape. */
  consequence: string;
};

export const PAYPAL_LESSON_RAIL_OPEN_DEFECTS: readonly PayPalRailDefect[] = [
  {
    id: "MON-01",
    file: "src/app/api/v1/payments/paypal/complete/route.ts",
    consequence:
      "Expired and failed attempts fall through to capture, and the parent booking is " +
      "never consulted. A student who opens checkout twice can approve both orders and be " +
      "charged twice for one lesson; a stale approve URL still captures after cancellation.",
  },
  {
    id: "MON-04",
    file: "src/app/api/v1/webhooks/paypal/route.ts",
    consequence:
      "The confirm and deny branches read purchase_units on a capture resource, which has " +
      "none, so neither branch ever fires. Payments confirm only via the browser redirect.",
  },
  {
    id: "MON-05",
    file: "src/app/api/v1/webhooks/paypal/route.ts",
    consequence:
      "Nothing captures an approved order server-side, so an abandoned tab loses the sale " +
      "after the student has already approved the payment.",
  },
  {
    id: "MON-06",
    file: "src/app/api/v1/webhooks/paypal/route.ts",
    consequence:
      "An order reads COMPLETED as soon as a capture exists, including a PENDING one, so " +
      "lesson access can be granted before the money is actually captured.",
  },
] as const;

/** True only when nothing is left blocking the rail. */
export function isPayPalLessonRailReleasable(): boolean {
  return PAYPAL_LESSON_RAIL_OPEN_DEFECTS.length === 0;
}

/** A single operator-facing explanation of why the flag did not take effect. */
export function payPalRailBlockedMessage(): string {
  const ids = PAYPAL_LESSON_RAIL_OPEN_DEFECTS.map((defect) => defect.id).join(", ");
  return (
    `LESSON_PAYMENTS_PAYPAL_ENABLED is "true" but the PayPal lesson rail is still blocked ` +
    `by unfixed defects (${ids}). The rail stays OFF. These are money bugs — MON-01 alone ` +
    `allows a student to be charged twice for one lesson. To enable the rail, fix them and ` +
    `remove their entries from src/lib/payments/paypal-rail-readiness.ts.`
  );
}
