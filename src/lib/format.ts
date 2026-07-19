export function formatCurrency(
  cents: number,
  currency = "USD",
): string {
  const locale =
    currency === "ZAR"
      ? "en-ZA"
      : currency === "GBP"
        ? "en-GB"
        : currency === "EUR"
          ? "en-IE"
          : currency === "AUD"
            ? "en-AU"
            : currency === "CAD"
              ? "en-CA"
              : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

export function formatStatus(status: string): string {
  return status.replaceAll("_", " ");
}
