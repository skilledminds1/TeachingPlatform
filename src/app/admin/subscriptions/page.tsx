import { CreditCard } from "lucide-react";

import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { PlanCatalogEditor } from "@/features/admin/components/plan-catalog-editor";
import { PlanSaleManager } from "@/features/admin/components/plan-sale-manager";
import { SubscriptionOrganizationsTable } from "@/features/admin/components/subscription-organizations-table";
import { requirePlatformAdmin } from "@/server/auth/session";
import {
  getAdminPlanCatalog,
  getAdminPlanSales,
  getAdminSubscriptionOrganizations,
} from "@/server/admin/subscriptions";

export default async function AdminSubscriptionsPage() {
  const admin = await requirePlatformAdmin();
  const [organizations, plans, sales] = await Promise.all([
    getAdminSubscriptionOrganizations(),
    getAdminPlanCatalog(),
    getAdminPlanSales(),
  ]);

  const planOptions = plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    slug: plan.slug,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-10">
      <AdminPageHeader
        title="Subscriptions"
        description="Grant complimentary upgrades, edit plan pricing and features, and run scheduled public sales."
      />

      <SubscriptionOrganizationsTable viewerTimeZone={admin.timezone}
        organizations={organizations.map((organization) => ({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          subscriptionStatus: organization.subscriptionStatus,
          billingInterval: organization.billingInterval,
          currentPeriodEnd: organization.currentPeriodEnd?.toISOString() ?? null,
          complimentaryExpiresAt:
            organization.complimentaryExpiresAt?.toISOString() ?? null,
          complimentaryNote: organization.complimentaryNote,
          hasPayfast: organization.hasPayfast,
          isComplimentary: organization.isComplimentary,
          adminContact: organization.adminContact,
          plan: organization.plan,
          complimentaryPlan: organization.complimentaryPlan,
          _count: organization._count,
        }))}
        plans={planOptions}
      />

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="size-5 text-primary" aria-hidden />
          <div>
            <h2 className="font-heading text-lg font-semibold">Plans & pricing</h2>
            <p className="text-sm text-muted-foreground">
              Changes appear on the marketing page and teacher billing checkout.
            </p>
          </div>
        </div>
        <PlanCatalogEditor
          plans={plans.map((plan) => ({
            id: plan.id,
            name: plan.name,
            slug: plan.slug,
            description: plan.description,
            monthlyPriceCents: plan.monthlyPriceCents,
            annualPriceCents: plan.annualPriceCents,
            currency: plan.currency,
            studentLimit: plan.studentLimit,
            monthlyLiveLessonMinutes: plan.monthlyLiveLessonMinutes,
            features: plan.features,
            marketplaceListing: plan.marketplaceListing,
            videoSessions: plan.videoSessions,
            teacherPayments: plan.teacherPayments,
            highlighted: plan.highlighted,
            sortOrder: plan.sortOrder,
            isPublic: plan.isPublic,
            monthlyEffective: {
              listCents: plan.monthlyEffective.listCents,
              effectiveCents: plan.monthlyEffective.effectiveCents,
              percentOff: plan.monthlyEffective.percentOff,
            },
            annualEffective: {
              listCents: plan.annualEffective.listCents,
              effectiveCents: plan.annualEffective.effectiveCents,
              percentOff: plan.annualEffective.percentOff,
            },
          }))}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-heading text-lg font-semibold">Scheduled sales</h2>
          <p className="text-sm text-muted-foreground">
            Public percent-off discounts applied automatically while active.
          </p>
        </div>
        <PlanSaleManager viewerTimeZone={admin.timezone}
          plans={planOptions}
          sales={sales.map((sale) => ({
            id: sale.id,
            name: sale.name,
            percentOff: sale.percentOff,
            startsAt: sale.startsAt.toISOString(),
            endsAt: sale.endsAt.toISOString(),
            active: sale.active,
            isLive: sale.isLive,
            intervalScope: sale.intervalScope,
            plans: sale.plans.map((item) => ({
              plan: {
                id: item.plan.id,
                name: item.plan.name,
                slug: item.plan.slug,
              },
            })),
          }))}
        />
      </section>
    </div>
  );
}
