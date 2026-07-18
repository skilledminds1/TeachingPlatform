import { db } from "@/lib/db";

export const planFeatures = [
  "teacher_profile",
  "marketplace_listing",
  "booking_calendar",
  "direct_messaging",
  "one_on_one_lessons",
  "basic_analytics",
  "community_support",
  "direct_payments",
  "courses",
  "homework",
  "file_sharing",
  "student_notes",
  "email_reminders",
  "reviews",
  "basic_reporting",
  "custom_availability",
  "unlimited_courses",
  "quizzes",
  "assignments",
  "certificates",
  "group_lessons",
  "calendar_sync",
  "video_integrations",
  "advanced_analytics",
  "priority_support",
  "team_teachers",
  "custom_branding",
  "api_access",
  "white_label_certificates",
  "advanced_reporting",
  "automation",
  "early_access",
] as const;

export type PlanFeature = (typeof planFeatures)[number];

export async function getOrganizationEntitlements(organizationId: string) {
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: {
      id: true,
      billingInterval: true,
      subscriptionStatus: true,
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
