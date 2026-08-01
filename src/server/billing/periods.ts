/**
 * Billing period arithmetic.
 *
 * Lives outside the webhook route so it can be tested directly — the month-end drift below
 * is exactly the kind of bug that only shows up on specific calendar dates.
 */

/**
 * Advance a billing period by one interval, clamping to the last day of the target month.
 *
 * MON-19: the previous implementation used `date.setUTCMonth(m + 1)`, which overflows on
 * month-end anchors — 31 January became 3 March, because 31 February does not exist. Since
 * each renewal extends the previously stored value, the anniversary crept forward a few days
 * on every month-end cycle, drifting the displayed renewal date, the invoice period, and the
 * moment a scheduled downgrade takes effect.
 *
 * KNOWN LIMITATION — clamp-and-stick. Because the only input is the *previous* period end,
 * a 31st anchor that clamps to 28 February then advances from the 28th and stays there: the
 * subscriber permanently shifts from the 31st to the 28th, losing a few days per cycle.
 * That is strictly better than the unbounded forward drift it replaces, but the correct fix
 * is to anchor renewals to the original signup day-of-month, which needs a billing-anchor
 * column on Organization. Deliberately deferred: it belongs with the P2 subscription
 * provider migration, which replaces this billing path outright, and adding a column for a
 * rail being retired would be throwaway work.
 */
export function nextPeriodEnd(
  current: Date | null,
  interval: "monthly" | "annual",
  now = new Date(),
): Date {
  const from = current && current > now ? new Date(current) : new Date(now);

  const targetYear = from.getUTCFullYear() + (interval === "annual" ? 1 : 0);
  const targetMonth = from.getUTCMonth() + (interval === "annual" ? 0 : 1);

  // Day 0 of the following month is the last day of the target month.
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();

  return new Date(
    Date.UTC(
      targetYear,
      targetMonth,
      Math.min(from.getUTCDate(), lastDayOfTargetMonth),
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}
