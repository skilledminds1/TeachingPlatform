import type { PaymentProvider } from "@prisma/client";

import {
  fromMinorUnits,
  providersForCurrency,
  toMinorUnits,
  type LessonPaymentProvider,
} from "@/lib/currencies";
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

/**
 * INT-09: these three used to be `amountFromCents` / `majorUnitsToCents` / `amountsMatch`,
 * and the first two hardcoded a factor of 100.
 *
 * The name was the bug. "Cents" is not a universal minor unit — ¥5000 is 5000 minor units,
 * not 500000 — so `amountFromCents(5000)` returned "50.00" and would have charged a Tokyo
 * teacher's student one hundredth of the lesson price. The currency argument is required
 * rather than defaulted precisely so that adding a call site is a decision, not an omission.
 *
 * The maths itself lives in src/lib/currencies.ts next to the exponent it depends on; these
 * are the payment-facing names for it.
 */

/** The decimal string a provider expects for an integer minor-unit amount. */
export function providerAmount(minorUnits: number, currency: string): string {
  return fromMinorUnits(minorUnits, currency);
}

/** A provider's decimal amount string, back as integer minor units. */
export function providerAmountToMinorUnits(
  amount: string | number,
  currency: string,
): number {
  return toMinorUnits(amount, currency);
}

/** Whether a provider-reported amount reconciles against what we expected to charge. */
export function amountsMatch(
  expectedMinorUnits: number,
  received: string | number,
  currency: string,
): boolean {
  return expectedMinorUnits === toMinorUnits(received, currency);
}
