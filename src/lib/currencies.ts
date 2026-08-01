/**
 * Currencies a teacher may settle lesson and course payments in.
 *
 * INT-08: ZAR used to head this list, marked `providers: ["paypal"]`. PayPal does not
 * support ZAR as a transaction currency at all, so any South African teacher who priced in
 * rand had every checkout fail at order creation — and it was the first option shown. It is
 * removed rather than re-pointed: the market is international, and the rand rail belongs
 * with the P2 provider work if it is ever needed.
 */
export const LESSON_CURRENCIES = [
  { code: "USD", label: "US Dollar ($)", symbol: "$", providers: ["paypal"] as const },
  { code: "EUR", label: "Euro (€)", symbol: "€", providers: ["paypal"] as const },
  { code: "GBP", label: "British Pound (£)", symbol: "£", providers: ["paypal"] as const },
  { code: "AUD", label: "Australian Dollar (A$)", symbol: "A$", providers: ["paypal"] as const },
  { code: "CAD", label: "Canadian Dollar (C$)", symbol: "C$", providers: ["paypal"] as const },
] as const;

/** The fallback whenever a currency is missing or unrecognised. */
export const DEFAULT_LESSON_CURRENCY = "USD" as const;

export type LessonCurrency = (typeof LESSON_CURRENCIES)[number]["code"];
export type LessonPaymentProvider = "paypal";

const currencySet = new Set<string>(LESSON_CURRENCIES.map((item) => item.code));

export function isLessonCurrency(value: string): value is LessonCurrency {
  return currencySet.has(value);
}

export function getCurrencyMeta(code: string) {
  return (
    LESSON_CURRENCIES.find((item) => item.code === code) ??
    // INT-08: this previously fell back to LESSON_CURRENCIES[1] — a positional index. It
    // happened to be USD only because ZAR sat at index 0; reordering the array would have
    // silently changed the default for every unrecognised currency in the product. Look the
    // fallback up by name so the list order carries no meaning.
    LESSON_CURRENCIES.find((item) => item.code === DEFAULT_LESSON_CURRENCY)!
  );
}

export function providersForCurrency(code: string): LessonPaymentProvider[] {
  const meta = LESSON_CURRENCIES.find((item) => item.code === code);
  // An unknown currency has no rail. Returning a provider anyway invited a checkout that
  // could only fail at the payment processor.
  return meta ? [...meta.providers] : [];
}

export function currencySymbol(code: string): string {
  return getCurrencyMeta(code).symbol;
}
