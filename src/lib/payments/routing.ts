import type { PaymentProvider } from "@prisma/client";

import { providersForCurrency, type LessonPaymentProvider } from "@/lib/currencies";
import { isLessonProviderEnabled } from "@/lib/payments/provider-flags";

export function routeLessonProviders(input: {
  currency: string;
  linkedProviders: PaymentProvider[];
}): LessonPaymentProvider[] {
  const supported = providersForCurrency(input.currency);
  return supported.filter((provider) => {
    if (!isLessonProviderEnabled(provider)) return false;
    return input.linkedProviders.includes(provider);
  });
}

export function amountFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function majorUnitsToCents(amount: string | number): number {
  return Math.round(Number(amount) * 100);
}

export function amountsMatch(expectedCents: number, received: string | number): boolean {
  return expectedCents === majorUnitsToCents(received);
}
