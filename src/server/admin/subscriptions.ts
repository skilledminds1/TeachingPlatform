import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/server/auth/session";
import {
  getActiveSalesForPlans,
  getEffectivePlanPrice,
} from "@/server/billing/pricing";

export async function getAdminSubscriptionOrganizations() {
  await requirePlatformAdmin();
  const organizations = await db.organization.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      subscriptionStatus: true,
      billingInterval: true,
      currentPeriodEnd: true,
      payfastToken: true,
      complimentaryPlanId: true,
      complimentaryExpiresAt: true,
      complimentaryGrantedAt: true,
      complimentaryNote: true,
      createdAt: true,
      plan: {
        select: {
          id: true,
          name: true,
          slug: true,
          monthlyPriceCents: true,
          annualPriceCents: true,
          currency: true,
        },
      },
      complimentaryPlan: {
        select: { id: true, name: true, slug: true },
      },
      complimentaryGrantedBy: {
        select: { id: true, name: true, email: true },
      },
      members: {
        where: { role: "admin" },
        take: 1,
        select: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      teacherProfiles: {
        take: 1,
        select: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      _count: {
        select: {
          members: true,
          teacherProfiles: true,
        },
      },
    },
  });

  return organizations.map((organization) => ({
    ...organization,
    adminContact:
      organization.members[0]?.user ??
      organization.teacherProfiles[0]?.user ??
      null,
    hasPayfast: Boolean(organization.payfastToken),
    isComplimentary: Boolean(organization.complimentaryPlanId),
  }));
}

export async function getAdminPlanCatalog() {
  await requirePlatformAdmin();
  const plans = await db.plan.findMany({
    orderBy: [{ sortOrder: "asc" }, { monthlyPriceCents: "asc" }],
  });
  const sales = await getActiveSalesForPlans(plans.map((plan) => plan.id));

  return plans.map((plan) => {
    const sale = sales.get(plan.id) ?? null;
    return {
      ...plan,
      monthlyEffective: getEffectivePlanPrice(plan, "monthly", sale),
      annualEffective: getEffectivePlanPrice(plan, "annual", sale),
      activeSale: sale,
    };
  });
}

export async function getAdminPlanSales(now = new Date()) {
  await requirePlatformAdmin();
  const sales = await db.planSale.findMany({
    orderBy: [{ active: "desc" }, { startsAt: "desc" }],
    include: {
      plans: {
        include: {
          plan: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  return sales.map((sale) => ({
    ...sale,
    isLive: sale.active && sale.startsAt <= now && sale.endsAt > now,
  }));
}
