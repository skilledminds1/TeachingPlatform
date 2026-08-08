import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/server/auth/session";

const recentLimit = 6;

// QLT-11: demo accounts are flagged on the row now, not inferred from the email domain.

const nonDemoUserWhere = {
  deletedAt: null,
  isDemo: false,
} satisfies Prisma.UserWhereInput;

const nonDemoOrganizationWhere = {
  deletedAt: null,
  slug: { not: { startsWith: "demo-" } },
} satisfies Prisma.OrganizationWhereInput;

const nonDemoTeacherWhere = {
  deletedAt: null,
  user: { isDemo: false },
  organization: { slug: { not: { startsWith: "demo-" } } },
} satisfies Prisma.TeacherProfileWhereInput;

const nonDemoBookingWhere = {
  teacher: { isDemo: false },
  student: { isDemo: false },
  organization: { slug: { not: { startsWith: "demo-" } } },
} satisfies Prisma.BookingWhereInput;

const nonDemoReviewWhere = {
  teacher: { isDemo: false },
  student: { isDemo: false },
} satisfies Prisma.ReviewWhereInput;

export async function getAdminDashboardData() {
  await requirePlatformAdmin();
  const [
    userCount,
    organizationCount,
    teacherCount,
    approvedTeacherCount,
    pendingTeacherCount,
    bookingCount,
    pendingReviewCount,
    activeOrganizations,
    recentUsers,
    recentAuditLogs,
  ] = await Promise.all([
    db.user.count({ where: nonDemoUserWhere }),
    db.organization.count({ where: nonDemoOrganizationWhere }),
    db.teacherProfile.count({ where: nonDemoTeacherWhere }),
    db.teacherProfile.count({
      where: { ...nonDemoTeacherWhere, status: "approved" },
    }),
    db.teacherProfile.count({
      where: { ...nonDemoTeacherWhere, status: "pending_approval" },
    }),
    db.booking.count({ where: nonDemoBookingWhere }),
    db.review.count({ where: { ...nonDemoReviewWhere, status: "pending" } }),
    db.organization.findMany({
      where: { ...nonDemoOrganizationWhere, subscriptionStatus: "active" },
      select: {
        billingInterval: true,
        plan: {
          select: {
            monthlyPriceCents: true,
            annualPriceCents: true,
          },
        },
      },
    }),
    db.user.findMany({
      where: nonDemoUserWhere,
      orderBy: { createdAt: "desc" },
      take: recentLimit,
      select: {
        id: true,
        name: true,
        email: true,
        isPlatformAdmin: true,
        createdAt: true,
        teacherProfile: { select: { status: true } },
        memberships: { select: { role: true } },
      },
    }),
    db.adminAuditLog.findMany({
      where: {
        admin: { isDemo: false },
      },
      orderBy: { createdAt: "desc" },
      take: recentLimit,
      include: {
        admin: { select: { name: true, email: true } },
      },
    }),
  ]);

  const monthlyRecurringRevenueCents = activeOrganizations.reduce(
    (total, organization) =>
      total +
      (organization.billingInterval === "annual"
        ? Math.round(organization.plan.annualPriceCents / 12)
        : organization.plan.monthlyPriceCents),
    0,
  );

  return {
    metrics: {
      userCount,
      organizationCount,
      teacherCount,
      approvedTeacherCount,
      pendingTeacherCount,
      bookingCount,
      pendingReviewCount,
      monthlyRecurringRevenueCents,
    },
    recentUsers,
    recentAuditLogs,
  };
}

export async function getTeacherModerationQueue() {
  await requirePlatformAdmin();
  return db.teacherProfile.findMany({
    where: nonDemoTeacherWhere,
    orderBy: [{ status: "asc" }, { submittedAt: "asc" }, { createdAt: "desc" }],
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          teacherPaymentAccounts: {
            where: {
              isActive: true,
              provider: "paypal",
            },
            select: { provider: true },
          },
        },
      },
      organization: { select: { name: true, slug: true } },
      subjects: { include: { subject: { select: { name: true } } } },
      qualifications: {
        orderBy: { createdAt: "asc" },
        select: {
          title: true,
          institution: true,
          issuedYear: true,
          credentialUrl: true,
          status: true,
        },
      },
    },
  });
}

export async function getReviewModerationQueue() {
  await requirePlatformAdmin();
  return db.review.findMany({
    where: nonDemoReviewWhere,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      student: { select: { name: true, email: true } },
      teacher: { select: { name: true, email: true } },
      booking: { select: { startsAt: true } },
    },
  });
}

export async function getAdminOrganizations() {
  await requirePlatformAdmin();
  return db.organization.findMany({
    where: nonDemoOrganizationWhere,
    orderBy: { createdAt: "desc" },
    include: {
      plan: {
        select: {
          name: true,
          monthlyPriceCents: true,
          annualPriceCents: true,
          currency: true,
          studentLimit: true,
        },
      },
      _count: { select: { members: true, teacherProfiles: true, bookings: true } },
    },
  });
}

export async function getAdminUsers() {
  await requirePlatformAdmin();
  return db.user.findMany({
    where: nonDemoUserWhere,
    orderBy: { createdAt: "desc" },
    include: {
      teacherProfile: { select: { status: true } },
      memberships: {
        select: {
          role: true,
          organization: { select: { name: true } },
        },
      },
    },
  });
}

export async function getAdminAuditLogs() {
  await requirePlatformAdmin();
  return db.adminAuditLog.findMany({
    where: {
      admin: { isDemo: false },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      admin: { select: { name: true, email: true } },
    },
  });
}
