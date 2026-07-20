export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 14;
export const GROWTH_BLOCK_DAY = 7;
export const DUNNING_NOTICE_DAYS = [0, 3, 6] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export type LifecycleState = {
  subscriptionStatus: "trialing" | "active" | "past_due" | "cancelled";
  trialEndsAt: Date | null;
  graceStartedAt: Date | null;
  graceEndsAt: Date | null;
};

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function startPaidTrial(now = new Date()): Pick<
  LifecycleState,
  "subscriptionStatus" | "trialEndsAt"
> {
  return { subscriptionStatus: "trialing", trialEndsAt: addDays(now, TRIAL_DAYS) };
}

export function startPaymentGrace(now = new Date()) {
  return {
    subscriptionStatus: "past_due" as const,
    graceStartedAt: now,
    graceEndsAt: addDays(now, GRACE_DAYS),
    dunningStage: 0,
    dunningLastNoticeAt: null,
  };
}

export function graceAgeDays(startedAt: Date, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / DAY_MS));
}

export function nextDunningStage(
  startedAt: Date,
  currentStage: number,
  now = new Date(),
): number | null {
  const age = graceAgeDays(startedAt, now);
  const nextIndex = DUNNING_NOTICE_DAYS.findIndex(
    (day, index) => index + 1 > currentStage && age >= day,
  );
  return nextIndex === -1 ? null : nextIndex + 1;
}

export function isGrowthBlocked(state: LifecycleState, now = new Date()): boolean {
  if (state.subscriptionStatus === "cancelled") return true;
  if (
    state.subscriptionStatus === "trialing" &&
    state.trialEndsAt !== null &&
    state.trialEndsAt <= now
  ) {
    return true;
  }
  return (
    state.subscriptionStatus === "past_due" &&
    state.graceStartedAt !== null &&
    graceAgeDays(state.graceStartedAt, now) >= GROWTH_BLOCK_DAY
  );
}

export function growthBlockMessage(state: LifecycleState, now = new Date()): string | null {
  if (!isGrowthBlocked(state, now)) return null;
  if (state.subscriptionStatus === "past_due") {
    return "New bookings and publishing are paused because payment is at least 7 days overdue. Existing lessons and course access remain available while you recover billing.";
  }
  if (state.subscriptionStatus === "trialing") {
    return "This paid trial has ended. Choose a paid plan to resume growth actions; existing learning access is preserved.";
  }
  return "This subscription is no longer active. Choose a plan to resume growth actions.";
}
