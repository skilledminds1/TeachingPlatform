import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { requireTeacher } from "@/server/auth/session";
import {
  getLiveLessonUsage,
  getStudentUsage,
} from "@/server/billing/entitlements";

export async function getBillingSettings() {
  const user = await requireTeacher();
  const membership = user.memberships.find((item) => item.role === "admin");
  if (!membership) return null;

  const [organization, plans, usage, liveLessonUsage] = await Promise.all([
    db.organization.findUniqueOrThrow({
      where: { id: membership.organizationId },
      select: {
        id: true,
        name: true,
        subscriptionStatus: true,
        billingInterval: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        plan: { select: { slug: true, name: true } },
      },
    }),
    db.plan.findMany({
      orderBy: { monthlyPriceCents: "asc" },
      select: {
        slug: true,
        name: true,
        monthlyPriceCents: true,
        annualPriceCents: true,
        currency: true,
        studentLimit: true,
        monthlyLiveLessonMinutes: true,
        courseLimit: true,
        features: true,
      },
    }),
    getStudentUsage(membership.organizationId),
    getLiveLessonUsage(membership.organizationId),
  ]);

  return {
    organization,
    plans,
    usage,
    liveLessonUsage,
    payfastConfigured: Boolean(
      env.PAYFAST_MERCHANT_ID &&
        env.PAYFAST_MERCHANT_KEY &&
        env.PAYFAST_PASSPHRASE &&
        env.PAYFAST_USD_ZAR_RATE,
    ),
  };
}
