import type { LessonPaymentProvider } from "@/lib/currencies";
import { env } from "@/lib/env";
import { logger } from "@/lib/observability/logger";
import {
  isPayPalLessonRailReleasable,
  payPalRailBlockedMessage,
} from "@/lib/payments/paypal-rail-readiness";

/**
 * Logged once rather than per call: this runs on every request that routes a provider, and a
 * misconfiguration that floods the log is a misconfiguration nobody reads.
 */
let blockedWarningEmitted = false;

function warnRailBlocked(): void {
  if (blockedWarningEmitted) return;
  blockedWarningEmitted = true;
  logger.error("paypal_lesson_rail_blocked_by_open_defects", {
    message: payPalRailBlockedMessage(),
  });
}

/** Feature flags + credential gates for lesson payment providers. */
export function isLessonProviderEnabled(provider: LessonPaymentProvider): boolean {
  switch (provider) {
    case "paypal": {
      if (env.LESSON_PAYMENTS_PAYPAL_ENABLED !== "true") return false;

      // The flag alone is no longer enough to turn this rail on. See
      // src/lib/payments/paypal-rail-readiness.ts — the handlers behind it still carry
      // known money bugs, and a config toggle should not be able to expose them.
      if (!isPayPalLessonRailReleasable()) {
        // Loud, so an operator who set the flag learns WHY it did nothing, rather than
        // concluding the gate is broken and deleting it.
        warnRailBlocked();
        return false;
      }

      return Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
    }
  }
}

export function configuredLessonProviders(): Record<LessonPaymentProvider, boolean> {
  return {
    paypal: isLessonProviderEnabled("paypal"),
  };
}
