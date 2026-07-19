export const LESSON_CURRENCIES = [
  { code: "ZAR", label: "South African Rand (R)", symbol: "R", providers: ["paypal"] as const },
  { code: "USD", label: "US Dollar ($)", symbol: "$", providers: ["paypal"] as const },
  { code: "EUR", label: "Euro (€)", symbol: "€", providers: ["paypal"] as const },
  { code: "GBP", label: "British Pound (£)", symbol: "£", providers: ["paypal"] as const },
  { code: "AUD", label: "Australian Dollar (A$)", symbol: "A$", providers: ["paypal"] as const },
  { code: "CAD", label: "Canadian Dollar (C$)", symbol: "C$", providers: ["paypal"] as const },
] as const;

export type LessonCurrency = (typeof LESSON_CURRENCIES)[number]["code"];
export type LessonPaymentProvider = "paypal";

const currencySet = new Set<string>(LESSON_CURRENCIES.map((item) => item.code));

export function isLessonCurrency(value: string): value is LessonCurrency {
  return currencySet.has(value);
}

export function getCurrencyMeta(code: string) {
  return LESSON_CURRENCIES.find((item) => item.code === code) ?? LESSON_CURRENCIES[1];
}

export function providersForCurrency(code: string): LessonPaymentProvider[] {
  const meta = LESSON_CURRENCIES.find((item) => item.code === code);
  return meta ? [...meta.providers] : ["paypal"];
}

export function currencySymbol(code: string): string {
  return getCurrencyMeta(code).symbol;
}
