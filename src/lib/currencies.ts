/**
 * Currencies a teacher may settle lesson payments in, and the minor-unit arithmetic that
 * goes with them.
 *
 * INT-08: ZAR used to head this list, marked `providers: ["paypal"]`. PayPal does not
 * support ZAR as a transaction currency at all, so any South African teacher who priced in
 * rand had every checkout fail at order creation — and it was the first option shown. It is
 * removed rather than re-pointed: the market is international, and the rand rail belongs
 * with the P2 provider work if it is ever needed.
 *
 * INT-09: the exponent came first, the list second, deliberately. Every amount in the
 * product is stored as an integer number of MINOR UNITS, and the code that turned those
 * integers into provider-facing decimal strings divided by 100 unconditionally. That is
 * correct only for currencies with two decimal digits, which is all this list used to hold.
 * Widening the list first would have shipped a 100x charging error the same day the first
 * Tokyo teacher signed up. `minorUnitExponent` is the fix, and it is derived rather than
 * hand-maintained — see the note on that function.
 */

/**
 * Number of decimal digits in a currency's minor unit, from the runtime's own ICU data.
 *
 * Derived, not tabulated. A hand-written map of exponents is a table that silently goes
 * stale, and getting an entry wrong misstates a real charge by a factor of 10 or 100. ICU
 * already ships ISO 4217 currency digits and keeps them current: JPY 0, USD 2, KWD 3.
 *
 * Unknown-but-well-formed codes resolve to 2, which is ICU's own default and the right
 * guess for a currency we have never heard of. Malformed input never reaches Intl, because
 * a non-ISO code makes the constructor throw.
 */
const exponentCache = new Map<string, number>();

export function minorUnitExponent(currency: string): number {
  const code = currency.trim().toUpperCase();
  const cached = exponentCache.get(code);
  if (cached !== undefined) return cached;

  let exponent = 2;
  if (/^[A-Z]{3}$/.test(code)) {
    try {
      // A fixed locale on purpose: ISO 4217 currency digits do not vary by locale, and
      // pinning it means the display locale can change without moving any money.
      const { maximumFractionDigits } = new Intl.NumberFormat("en", {
        style: "currency",
        currency: code,
      }).resolvedOptions();
      if (typeof maximumFractionDigits === "number" && maximumFractionDigits >= 0) {
        exponent = maximumFractionDigits;
      }
    } catch {
      // ICU rejected the code. Two digits is the safe default.
    }
  }

  exponentCache.set(code, exponent);
  return exponent;
}

/** 10^exponent — how many minor units make one major unit. */
export function minorUnitFactor(currency: string): number {
  return 10 ** minorUnitExponent(currency);
}

/**
 * Render an integer minor-unit amount as the decimal string a payment provider expects.
 *
 * Done with integer string surgery rather than `(value / factor).toFixed(n)` because the
 * division is binary floating point and this is money. The old implementation was
 * `(cents / 100).toFixed(2)`, which turned ¥5000 into "50.00" — a hundredth of the price,
 * and a decimal point PayPal rejects on JPY regardless.
 *
 * Throws on a non-finite amount. Posting the string "NaN" to a payment provider is a worse
 * outcome than a failed order.
 */
export function fromMinorUnits(minorUnits: number, currency: string): string {
  if (!Number.isFinite(minorUnits)) {
    throw new Error(`Cannot format a non-finite ${currency} amount: ${minorUnits}`);
  }

  const exponent = minorUnitExponent(currency);
  const rounded = Math.round(minorUnits);
  const digits = Math.abs(rounded).toString().padStart(exponent + 1, "0");
  const split = digits.length - exponent;
  const fraction = exponent > 0 ? `.${digits.slice(split)}` : "";

  return `${rounded < 0 ? "-" : ""}${digits.slice(0, split)}${fraction}`;
}

/**
 * Parse a provider's decimal amount string back into integer minor units.
 *
 * Also exact: `Math.round(Number("12.345") * 100)` happens to give 1235, but only because
 * that particular value rounds the way we want — the general case does not, and a
 * half-cent slip on a reconciliation comparison reads as a payment mismatch.
 */
export function toMinorUnits(amount: string | number, currency: string): number {
  const exponent = minorUnitExponent(currency);
  const text = typeof amount === "number" ? String(amount) : amount.trim();
  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(text);

  if (!match || (!match[2] && !match[3])) {
    // Scientific notation or junk. Fall back to scaling so callers still get a number, but
    // this is not a path any real provider amount takes.
    const scaled = Number(amount) * 10 ** exponent;
    return Number.isFinite(scaled) ? Math.round(scaled) : Number.NaN;
  }

  const [, sign, whole = "", fraction = ""] = match;
  // One digit past the exponent decides the rounding, so pad to exponent + 1.
  const padded = fraction.padEnd(exponent + 1, "0");
  const kept = Number(`${whole || "0"}${padded.slice(0, exponent)}`);
  const magnitude = kept + (Number(padded[exponent]) >= 5 ? 1 : 0);

  return sign ? -magnitude : magnitude;
}

/**
 * The settlement currencies offered to teachers.
 *
 * Ordered USD/EUR/GBP first because they cover most of the marketplace, then alphabetically.
 * The order carries no other meaning and nothing may index into this array — see
 * `getCurrencyMeta`.
 *
 * INT-09 checked every entry against two gates. ONE OF THEM IS GONE.
 *
 * The first gate used to be "PayPal can transact it", and it was the binding one: INR, ZAR,
 * KRW, IDR, TRY, BGN, ISK, RON were all excluded purely because PayPal did not list them,
 * and BRL, CNY and MYR because PayPal supported them for in-country accounts only. The PayPal
 * rail is deleted. Students now pay on the TEACHER's own provider, so the currency a teacher
 * may price in is constrained by their provider and not by ours — a rand-priced lesson paid
 * through Yoco is not this platform's problem to route.
 *
 * The second gate still binds: the ECB reference feed behind `fx_rates` must quote the
 * currency, or the marketplace price filter ranks that teacher as though their number were
 * already USD (see src/lib/fx.ts). RUB fails this and stays out.
 *
 * The exponent gate also still binds, for a different reason: HUF and TWD are documented
 * with no decimals by some providers while ISO 4217 — and therefore ICU, and therefore
 * `minorUnitExponent` — gives them 2. Listing a currency the code and the payer's bank
 * disagree about is how an amount ends up 100x wrong.
 *
 * THIS LIST IS NOW NARROWER THAN IT NEEDS TO BE. Widening it is a real task — each addition
 * needs an ECB quote and an exponent check — and deliberately not done as part of deleting
 * the rail, so that the additions get their own review rather than riding along in a deletion.
 * INR and ZAR are the two that most obviously belong.
 */
export const LESSON_CURRENCIES = [
  { code: "USD", label: "US Dollar ($)", symbol: "$" },
  { code: "EUR", label: "Euro (€)", symbol: "€" },
  { code: "GBP", label: "British Pound (£)", symbol: "£" },
  { code: "AUD", label: "Australian Dollar (A$)", symbol: "A$" },
  { code: "CAD", label: "Canadian Dollar (C$)", symbol: "C$" },
  { code: "CHF", label: "Swiss Franc (CHF)", symbol: "CHF" },
  { code: "CZK", label: "Czech Koruna (Kč)", symbol: "Kč" },
  { code: "DKK", label: "Danish Krone (kr)", symbol: "kr" },
  { code: "HKD", label: "Hong Kong Dollar (HK$)", symbol: "HK$" },
  { code: "ILS", label: "Israeli New Shekel (₪)", symbol: "₪" },
  // Zero-decimal. The reason the exponent had to be fixed before this list could grow.
  { code: "JPY", label: "Japanese Yen (¥)", symbol: "¥" },
  { code: "MXN", label: "Mexican Peso (MX$)", symbol: "MX$" },
  { code: "NOK", label: "Norwegian Krone (kr)", symbol: "kr" },
  { code: "NZD", label: "New Zealand Dollar (NZ$)", symbol: "NZ$" },
  { code: "PHP", label: "Philippine Peso (₱)", symbol: "₱" },
  { code: "PLN", label: "Polish Złoty (zł)", symbol: "zł" },
  { code: "SEK", label: "Swedish Krona (kr)", symbol: "kr" },
  { code: "SGD", label: "Singapore Dollar (S$)", symbol: "S$" },
  { code: "THB", label: "Thai Baht (฿)", symbol: "฿" },
] as const;

/** The fallback whenever a currency is missing or unrecognised. */
export const DEFAULT_LESSON_CURRENCY = "USD" as const;

export type LessonCurrency = (typeof LESSON_CURRENCIES)[number]["code"];

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

export function currencySymbol(code: string): string {
  return getCurrencyMeta(code).symbol;
}
