import { db } from "@/lib/db";
import {
  planFeatures,
  type PlanFeature,
} from "@/features/billing/lib/plan-feature-labels";

export { planFeatures, type PlanFeature };

async function expireComplimentaryAccess(organizationId: string, now = new Date()) {
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      planId: true,
      complimentaryPlanId: true,
      complimentaryExpiresAt: true,
      complimentaryPreviousPlanId: true,
    },
  });
  if (!organization?.complimentaryPlanId) return false;
  if (
    organization.complimentaryExpiresAt &&
    organization.complimentaryExpiresAt > now
  ) {
    return false;
  }
  // Permanent grants (null expiry) never auto-expire.
  if (!organization.complimentaryExpiresAt) return false;

  const freePlan = await db.plan.findUnique({
    where: { slug: "free" },
    select: { id: true },
  });
  if (!freePlan) return false;

  await db.organization.update({
    where: { id: organization.id },
    data: {
      planId: freePlan.id,
      subscriptionStatus: "active",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      complimentaryPlanId: null,
      complimentaryExpiresAt: null,
      complimentaryGrantedById: null,
      complimentaryGrantedAt: null,
      complimentaryPreviousPlanId: null,
      complimentaryNote: null,
    },
  });

  return true;
}

export async function getOrganizationEntitlements(organizationId: string) {
  await expireComplimentaryAccess(organizationId);

  const organization = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: {
      id: true,
      billingInterval: true,
      subscriptionStatus: true,
      complimentaryPlanId: true,
      complimentaryExpiresAt: true,
      complimentaryGrantedAt: true,
      complimentaryNote: true,
      plan: {
        select: {
          id: true,
          name: true,
          slug: true,
          studentLimit: true,
          monthlyLiveLessonMinutes: true,
          courseLimit: true,
          features: true,
          monthlyPriceCents: true,
          annualPriceCents: true,
          currency: true,
        },
      },
    },
  });

  return {
    ...organization,
    isComplimentary: Boolean(organization.complimentaryPlanId),
    features: new Set(organization.plan.features as PlanFeature[]),
  };
}

export async function getLiveLessonUsage(organizationId: string, now = new Date()) {
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const [entitlements, bookings] = await Promise.all([
    getOrganizationEntitlements(organizationId),
    db.booking.findMany({
      where: {
        organizationId,
        startsAt: { gte: periodStart, lt: periodEnd },
        status: { in: ["pending_payment", "confirmed", "completed"] },
      },
      select: { startsAt: true, endsAt: true },
    }),
  ]);
  const usedMinutes = bookings.reduce(
    (total, booking) =>
      total +
      Math.max(
        0,
        Math.round((booking.endsAt.getTime() - booking.startsAt.getTime()) / 60_000),
      ),
    0,
  );
  const limit = entitlements.plan.monthlyLiveLessonMinutes;
  const remainingMinutes = limit === null ? null : Math.max(0, limit - usedMinutes);
  const atLimit = limit !== null && usedMinutes >= limit;
  const recommendedPlan =
    limit !== null
      ? await db.plan.findFirst({
          where: {
            OR: [
              { monthlyLiveLessonMinutes: { gt: usedMinutes } },
              { monthlyLiveLessonMinutes: null },
            ],
          },
          orderBy: { monthlyPriceCents: "asc" },
          select: {
            name: true,
            slug: true,
            monthlyLiveLessonMinutes: true,
            monthlyPriceCents: true,
          },
        })
      : null;

  return {
    usedMinutes,
    limit,
    remainingMinutes,
    atLimit,
    periodStart,
    periodEnd,
    plan: entitlements.plan,
    recommendedPlan,
  };
}

export async function hasFeature(
  organizationId: string,
  feature: PlanFeature,
): Promise<boolean> {
  const entitlements = await getOrganizationEntitlements(organizationId);
  return entitlements.features.has(feature);
}

export async function getStudentUsage(organizationId: string) {
  const [entitlements, activeStudents] = await Promise.all([
    getOrganizationEntitlements(organizationId),
    db.studentRelationship.count({
      where: {
        organizationId,
        status: "active",
      },
    }),
  ]);

  const limit = entitlements.plan.studentLimit;
  const atLimit = limit !== null && activeStudents >= limit;

  const recommendedPlan = atLimit
    ? await db.plan.findFirst({
        where: {
          studentLimit: { gt: activeStudents },
        },
        orderBy: { monthlyPriceCents: "asc" },
        select: {
          name: true,
          slug: true,
          studentLimit: true,
          monthlyPriceCents: true,
          currency: true,
        },
      })
    : null;

  return {
    activeStudents,
    limit,
    atLimit,
    plan: entitlements.plan,
    recommendedPlan,
  };
}

export async function getCourseUsage(organizationId: string) {
  const [entitlements, courseCount] = await Promise.all([
    getOrganizationEntitlements(organizationId),
    db.course.count({
      where: {
        organizationId,
        deletedAt: null,
      },
    }),
  ]);

  const limit = entitlements.plan.courseLimit;
  const atLimit = limit !== null && courseCount >= limit;
  const recommendedPlan = atLimit
    ? await db.plan.findFirst({
        where: {
          OR: [{ courseLimit: { gt: courseCount } }, { courseLimit: null }],
        },
        orderBy: { monthlyPriceCents: "asc" },
        select: {
          name: true,
          slug: true,
          courseLimit: true,
          monthlyPriceCents: true,
          currency: true,
        },
      })
    : null;

  return {
    courseCount,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - courseCount),
    atLimit,
    plan: entitlements.plan,
    recommendedPlan,
  };
}

export async function canAcceptStudent(input: {
  organizationId: string;
  teacherId: string;
  studentId: string;
}) {
  const existing = await db.studentRelationship.findUnique({
    where: {
      organizationId_teacherId_studentId: input,
    },
    select: { status: true },
  });

  // Existing students can always continue working with their teacher.
  if (existing?.status === "active") {
    return { allowed: true as const, existing: true as const };
  }

  const usage = await getStudentUsage(input.organizationId);
  if (!usage.atLimit) {
    return { allowed: true as const, existing: false as const };
  }

  return {
    allowed: false as const,
    existing: false as const,
    code: "PLAN_LIMIT_EXCEEDED" as const,
    message: `You've reached the limit of ${usage.limit} active student${
      usage.limit === 1 ? "" : "s"
    }. Upgrade to the ${usage.recommendedPlan?.name ?? "next"} plan to continue accepting new students.`,
    ...usage,
  };
}
