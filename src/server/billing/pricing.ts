import { db } from "@/lib/db";
import { planFeatureLabels } from "@/features/billing/lib/plan-feature-labels";

export type BillingIntervalChoice = "monthly" | "annual";

export type PlanPriceInput = {
  id: string;
  monthlyPriceCents: number;
  annualPriceCents: number;
};

export type ActiveSale = {
  id: string;
  name: string;
  percentOff: number;
  endsAt: Date;
  intervalScope: "monthly" | "annual" | "both";
};

export { planFeatureLabels };

function saleAppliesToInterval(
  scope: ActiveSale["intervalScope"],
  interval: BillingIntervalChoice,
): boolean {
  return scope === "both" || scope === interval;
}

export function applyPercentOff(cents: number, percentOff: number): number {
  if (percentOff <= 0) return cents;
  return Math.max(0, Math.round(cents * (1 - percentOff / 100)));
}

export async function getActiveSalesForPlans(
  planIds: string[],
  now = new Date(),
): Promise<Map<string, ActiveSale>> {
  if (planIds.length === 0) return new Map();

  const sales = await db.planSale.findMany({
    where: {
      active: true,
      startsAt: { lte: now },
      endsAt: { gt: now },
      plans: { some: { planId: { in: planIds } } },
    },
    orderBy: [{ percentOff: "desc" }, { endsAt: "asc" }],
    select: {
      id: true,
      name: true,
      percentOff: true,
      endsAt: true,
      intervalScope: true,
      plans: { select: { planId: true } },
    },
  });

  const byPlan = new Map<string, ActiveSale>();
  for (const sale of sales) {
    const activeSale: ActiveSale = {
      id: sale.id,
      name: sale.name,
      percentOff: sale.percentOff,
      endsAt: sale.endsAt,
      intervalScope: sale.intervalScope,
    };
    for (const link of sale.plans) {
      if (!planIds.includes(link.planId)) continue;
      const existing = byPlan.get(link.planId);
      if (!existing || activeSale.percentOff > existing.percentOff) {
        byPlan.set(link.planId, activeSale);
      }
    }
  }
  return byPlan;
}

export function getEffectivePlanPrice(
  plan: PlanPriceInput,
  interval: BillingIntervalChoice,
  sale: ActiveSale | null | undefined,
): {
  listCents: number;
  effectiveCents: number;
  percentOff: number;
  sale: ActiveSale | null;
} {
  const listCents =
    interval === "annual" ? plan.annualPriceCents : plan.monthlyPriceCents;
  if (!sale || !saleAppliesToInterval(sale.intervalScope, interval)) {
    return { listCents, effectiveCents: listCents, percentOff: 0, sale: null };
  }
  return {
    listCents,
    effectiveCents: applyPercentOff(listCents, sale.percentOff),
    percentOff: sale.percentOff,
    sale,
  };
}

export async function getCatalogPlansWithPricing(now = new Date()) {
  const plans = await db.plan.findMany({
    where: { isPublic: true },
    orderBy: [{ sortOrder: "asc" }, { monthlyPriceCents: "asc" }],
  });
  const sales = await getActiveSalesForPlans(
    plans.map((plan) => plan.id),
    now,
  );

  return plans.map((plan) => {
    const sale = sales.get(plan.id) ?? null;
    const monthly = getEffectivePlanPrice(plan, "monthly", sale);
    const annual = getEffectivePlanPrice(plan, "annual", sale);
    return {
      ...plan,
      monthly,
      annual,
      sale,
    };
  });
}

/**
 * Features whose label would only repeat a limit bullet the card already prints above it.
 * Empty today — the seeded catalogue has no such feature — but the card renders the two
 * limits unconditionally, so anything added here that restates them belongs in this set.
 */
const LIMIT_RESTATING_FEATURES = new Set<string>([]);

export async function getMarketingPlans(now = new Date()) {
  const plans = await getCatalogPlansWithPricing(now);

  return plans.map((plan, index) => {
    const limitBullets = [
      plan.studentLimit === null
        ? "Unlimited active students"
        : `${plan.studentLimit} active student${plan.studentLimit === 1 ? "" : "s"}`,
      plan.monthlyLiveLessonMinutes === null
        ? "Unlimited live lessons (fair use)"
        : `${plan.monthlyLiveLessonMinutes / 60} live lesson hours / month`,
    ];

    // Show what this tier ADDS over the one below it, not its first six features.
    //
    // Each tier's feature array is built by spreading the tier below (prisma/seed.ts), so the
    // first six entries are identical on all four plans. That was masked while a third limit
    // bullet named the course allowance and differed per tier; removing the courses product
    // took that bullet with it and left every tier rendering the same list, which gives a
    // visitor no reason to upgrade. Plans arrive ordered by sortOrder, so the previous entry
    // is the next tier down.
    const inherited = new Set(index > 0 ? plans[index - 1].features : []);
    const distinctive = plan.features.filter((feature) => !inherited.has(feature));

    // The lowest tier inherits nothing, so "what it adds" is simply what it has.
    //
    // Deduplication is keyed on the FEATURE, not the rendered label. Matching the label text
    // for "student" or "live lesson" — which is what this did — silently ate "Student notes",
    // a real Starter feature, because the substring test cannot tell a limit restatement from
    // a feature that happens to mention students.
    const featureBullets = (distinctive.length > 0 ? distinctive : plan.features)
      .filter((feature) => !LIMIT_RESTATING_FEATURES.has(feature))
      .map((feature) => planFeatureLabels[feature])
      .filter((label): label is string => Boolean(label))
      .slice(0, 6);

    return {
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      description: plan.description ?? "",
      highlighted: plan.highlighted,
      currency: plan.currency,
      monthlyListCents: plan.monthly.listCents,
      monthlyEffectiveCents: plan.monthly.effectiveCents,
      annualListCents: plan.annual.listCents,
      annualEffectiveCents: plan.annual.effectiveCents,
      monthlyPercentOff: plan.monthly.percentOff,
      annualPercentOff: plan.annual.percentOff,
      saleName: plan.sale?.name ?? null,
      saleEndsAt: plan.sale?.endsAt?.toISOString() ?? null,
      features: [...limitBullets, ...featureBullets],
      cta:
        plan.slug === "free"
          ? "Start free"
          : plan.slug === "professional"
            ? "Choose Professional"
            : `Choose ${plan.name}`,
    };
  });
}

export async function getBillingPlansWithPricing(now = new Date()) {
  const plans = await getCatalogPlansWithPricing(now);
  return plans.map((plan) => ({
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    currency: plan.currency,
    studentLimit: plan.studentLimit,
    monthlyLiveLessonMinutes: plan.monthlyLiveLessonMinutes,
    features: plan.features,
    highlighted: plan.highlighted,
    monthlyPriceCents: plan.monthly.listCents,
    annualPriceCents: plan.annual.listCents,
    monthlyEffectiveCents: plan.monthly.effectiveCents,
    annualEffectiveCents: plan.annual.effectiveCents,
    monthlyPercentOff: plan.monthly.percentOff,
    annualPercentOff: plan.annual.percentOff,
    saleName: plan.sale?.name ?? null,
    saleEndsAt: plan.sale?.endsAt?.toISOString() ?? null,
  }));
}
