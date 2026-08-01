"use client";

import { useSyncExternalStore } from "react";

import { formatCurrency } from "@/lib/format";
import { currencyForLocale } from "@/lib/viewer-currency";

/**
 * An approximate price in the viewer's own currency (INT-11).
 *
 * A student in Japan looking at a UK teacher saw "£25/hr" and nothing else. This adds a
 * second, clearly-approximate line so they can judge affordability without leaving the page.
 *
 * The teacher's own price remains the authoritative figure — it is what they are actually
 * charged, in the teacher's currency, and this number never reaches a payment request.
 * Rendered client-side because it depends on the viewer's locale; it simply does not appear
 * during SSR, which is correct for a secondary hint rather than something to fake.
 */

const noopSubscribe = () => () => {};

function useViewerCurrency(): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => currencyForLocale(navigator.language),
    // No locale on the server, so nothing renders until hydration.
    () => null,
  );
}

export function IndicativePrice({
  amountMinorUnits,
  currency,
  rates,
  stale,
}: {
  /** The teacher's price, in their own currency's minor units. */
  amountMinorUnits: number;
  /** The teacher's currency. */
  currency: string;
  /** Units per 1 USD, from the live rate table. */
  rates: Record<string, number>;
  /** True when the rate table is too old to stand behind. */
  stale: boolean;
}) {
  const viewerCurrency = useViewerCurrency();

  // Say nothing rather than something wrong: same currency, no rate, or stale table.
  if (!viewerCurrency || stale) return null;
  if (viewerCurrency.toUpperCase() === currency.toUpperCase()) return null;

  const fromRate = rates[currency.toUpperCase()];
  const toRate = rates[viewerCurrency.toUpperCase()];
  if (!fromRate || !toRate) return null;

  const converted = Math.round((amountMinorUnits / fromRate) * toRate);

  return (
    <span className="text-xs text-muted-foreground">
      {/* "≈" and the wording both signal this is not the amount they will be charged. */}
      ≈ {formatCurrency(converted, viewerCurrency)}
    </span>
  );
}
