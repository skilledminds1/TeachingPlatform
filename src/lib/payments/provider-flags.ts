import { env } from "@/lib/env";
import type { LessonPaymentProvider } from "@/lib/currencies";

/** Feature flags + credential gates for lesson payment providers. */
export function isLessonProviderEnabled(provider: LessonPaymentProvider): boolean {
  switch (provider) {
    case "paypal":
      return (
        env.LESSON_PAYMENTS_PAYPAL_ENABLED === "true" &&
        Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET)
      );
  }
}

export function configuredLessonProviders(): Record<LessonPaymentProvider, boolean> {
  return {
    paypal: isLessonProviderEnabled("paypal"),
  };
}
