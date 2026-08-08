const DAY_MS = 24 * 60 * 60 * 1_000;

export function isBookingRefundPolicyEligible(startsAt: Date, now = new Date()): boolean {
  return startsAt.getTime() - now.getTime() >= DAY_MS;
}

