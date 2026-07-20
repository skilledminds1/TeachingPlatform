const DAY_MS = 24 * 60 * 60 * 1_000;

export function isBookingRefundPolicyEligible(startsAt: Date, now = new Date()): boolean {
  return startsAt.getTime() - now.getTime() >= DAY_MS;
}

export function isCourseRefundPolicyEligible(input: {
  purchasedAt: Date;
  completedLessons: number;
  totalLessons: number;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  const progressPercent =
    input.totalLessons === 0 ? 0 : (input.completedLessons / input.totalLessons) * 100;
  return now.getTime() - input.purchasedAt.getTime() <= 7 * DAY_MS && progressPercent < 20;
}
