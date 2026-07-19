import { env } from "@/lib/env";
import type { LessonPaymentProvider } from "@/lib/currencies";

/** Feature flags + credential gates for lesson payment providers. */
export function isLessonProviderEnabled(provider: LessonPaymentProvider): boolean {
  switch (provider) {
    case "payfast":
      return (
        env.LESSON_PAYMENTS_PAYFAST_ENABLED === "true" &&
        Boolean(env.PAYFAST_MERCHANT_ID && env.PAYFAST_MERCHANT_KEY)
      );
    case "paypal":
      return (
        env.LESSON_PAYMENTS_PAYPAL_ENABLED === "true" &&
        Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET)
      );
  }
}

export function configuredLessonProviders(): Record<LessonPaymentProvider, boolean> {
  return {
    payfast: isLessonProviderEnabled("payfast"),
    paypal: isLessonProviderEnabled("paypal"),
  };
}
