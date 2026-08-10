"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { planFeatures } from "@/features/billing/lib/plan-feature-labels";
import { requirePlatformAdmin } from "@/server/auth/session";
import { fail, ok, type ActionResult } from "@/types/action";

const uuid = z.string().uuid();

const grantSchema = z
  .object({
    organizationId: uuid,
    planId: uuid,
    permanent: z.boolean(),
    expiresAt: z.string().datetime().optional().nullable(),
    note: z.string().trim().max(500).optional().nullable(),
    /**
     * MON-21: granting complimentary access to an organization with a live paid
     * subscription cancels that subscription and nulls the token, and nothing can bring it
     * back — complimentaryPreviousPlanId is stored but never used to restore anything. When
     * the complimentary period ends the org drops to Free and must re-checkout from scratch.
     * A one-month thank-you upgrade to a paying Business customer therefore converts them
     * into a non-paying one. The admin has to acknowledge that explicitly.
     */
    confirmCancelsPaidSubscription: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.permanent) {
      if (!value.expiresAt) {
        ctx.addIssue({
          code: "custom",
          message: "Choose an expiry date or make the upgrade permanent.",
          path: ["expiresAt"],
        });
        return;
      }
      if (new Date(value.expiresAt) <= new Date()) {
        ctx.addIssue({
          code: "custom",
          message: "Expiry must be in the future.",
          path: ["expiresAt"],
        });
      }
    }
  });

const revokeSchema = z.object({
  organizationId: uuid,
});

const featureEnum = z.enum(
  planFeatures as unknown as [typeof planFeatures[number], ...typeof planFeatures[number][]],
);

const updatePlanSchema = z.object({
  planId: uuid,
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional().nullable(),
  monthlyPriceCents: z.number().int().min(0).max(10_000_000),
  annualPriceCents: z.number().int().min(0).max(10_000_000),
  currency: z.string().trim().length(3),
  studentLimit: z.number().int().min(0).nullable(),
  monthlyLiveLessonMinutes: z.number().int().min(0).nullable(),
  features: z.array(featureEnum).max(planFeatures.length),
  marketplaceListing: z.boolean(),
  videoSessions: z.boolean(),
  teacherPayments: z.boolean(),
  highlighted: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
  isPublic: z.boolean(),
});

const saleSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    percentOff: z.number().int().min(1).max(100),
    /**
     * The Paddle discount that actually applies this sale.
     *
     * Optional so a sale can be drafted before the discount exists in Paddle — but a sale
     * without one is not advertised anywhere, because getEffectivePlanPrice reports it as no
     * sale. The shape is checked so a mistyped id fails here rather than at a customer's
     * checkout, where the failure is a discount that silently does not apply.
     */
    paddleDiscountId: z
      .string()
      .trim()
      .regex(/^dsc_[A-Za-z0-9]+$/, "A Paddle discount id looks like dsc_01abc…")
      .or(z.literal(""))
      .optional()
      .transform((value) => (value ? value : null)),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    intervalScope: z.enum(["monthly", "annual", "both"]),
    planIds: z.array(uuid).min(1),
    active: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (new Date(value.endsAt) <= new Date(value.startsAt)) {
      ctx.addIssue({
        code: "custom",
        message: "Sale end must be after the start.",
        path: ["endsAt"],
      });
    }
  });

function revalidateSubscriptionViews() {
  revalidatePath("/admin");
  revalidatePath("/admin/subscriptions");
  revalidatePath("/admin/organizations");
  revalidatePath("/admin/analytics");
  revalidatePath("/dashboard/teacher");
  revalidatePath("/dashboard/teacher/billing");
  revalidatePath("/");
}

export async function grantComplimentaryPlan(
  input: unknown,
): Promise<ActionResult<{ granted: true }>> {
  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      parsed.error.issues[0]?.message ?? "Invalid complimentary upgrade.",
      "VALIDATION_ERROR",
    );
  }

  const admin = await requirePlatformAdmin();
  const [organization, plan, freePlan] = await Promise.all([
    db.organization.findFirst({
      where: { id: parsed.data.organizationId, deletedAt: null },
      select: {
        id: true,
        planId: true,
        paddleSubscriptionId: true,
        subscriptionStatus: true,
        complimentaryPlanId: true,
        plan: { select: { id: true, name: true, slug: true } },
      },
    }),
    db.plan.findUnique({
      where: { id: parsed.data.planId },
      select: { id: true, name: true, slug: true, monthlyPriceCents: true },
    }),
    db.plan.findUnique({ where: { slug: "free" }, select: { id: true } }),
  ]);

  if (!organization) return fail("Organization not found.", "NOT_FOUND");
  if (!plan) return fail("Plan not found.", "NOT_FOUND");
  if (!freePlan) return fail("Free plan is missing.", "INTERNAL_ERROR");
  if (plan.slug === "free") {
    return fail("Choose a paid plan for complimentary upgrades.", "VALIDATION_ERROR");
  }

  if (organization.paddleSubscriptionId) {
    // MON-21: this is destructive and irreversible — require the caller to have been told.
    if (!parsed.data.confirmCancelsPaidSubscription) {
      return fail(
        "This organization has an active paid subscription. Granting complimentary access " +
          "cancels it permanently — it cannot be restored automatically, and they will have " +
          "to check out again when the complimentary period ends. Re-submit with " +
          "confirmation to proceed.",
        "CONFLICT",
      );
    }

    if (organization.paddleSubscriptionId) {
      // Granting a complimentary plan over a LIVE paid subscription would leave the teacher
      // billed by Paddle for something they were just given. Cancelling at Paddle needs
      // PADDLE_API_KEY, so until that exists the grant is refused rather than applied on top.
      return fail(
        "This organization has an active Paddle subscription. Cancel it in Paddle first, then grant the complimentary plan.",
        "CONFLICT",
      );
    }
  }

  const expiresAt =
    parsed.data.permanent || !parsed.data.expiresAt
      ? null
      : new Date(parsed.data.expiresAt);

  await db.$transaction([
    db.organization.update({
      where: { id: organization.id },
      data: {
        planId: plan.id,
        subscriptionStatus: "active",
        cancelAtPeriodEnd: false,
        paddleSubscriptionId: null,
        currentPeriodEnd: expiresAt,
        graceStartedAt: null,
        graceEndsAt: null,
        dunningStage: 0,
        dunningLastNoticeAt: null,
        pendingPlanId: null,
        pendingBillingInterval: null,
        pendingChangeAt: null,
        complimentaryPlanId: plan.id,
        complimentaryExpiresAt: expiresAt,
        complimentaryGrantedById: admin.id,
        complimentaryGrantedAt: new Date(),
        complimentaryPreviousPlanId: organization.planId,
        complimentaryNote: parsed.data.note?.trim() || null,
      },
    }),
    db.adminAuditLog.create({
      data: {
        adminUserId: admin.id,
        action: "subscription.complimentary_grant",
        targetType: "Organization",
        targetId: organization.id,
        metadata: {
          previousPlanId: organization.planId,
          previousPlanSlug: organization.plan.slug,
          previousStatus: organization.subscriptionStatus,
          planId: plan.id,
          planSlug: plan.slug,
          permanent: parsed.data.permanent,
          expiresAt: expiresAt?.toISOString() ?? null,
          note: parsed.data.note ?? null,
          cancelledSubscription: Boolean(organization.paddleSubscriptionId),
        },
      },
    }),
  ]);

  revalidateSubscriptionViews();
  return ok({ granted: true });
}

export async function revokeComplimentaryPlan(
  input: unknown,
): Promise<ActionResult<{ revoked: true }>> {
  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Invalid organization.", "VALIDATION_ERROR");
  }

  const admin = await requirePlatformAdmin();
  const organization = await db.organization.findFirst({
    where: { id: parsed.data.organizationId, deletedAt: null },
    select: {
      id: true,
      planId: true,
      complimentaryPlanId: true,
      complimentaryExpiresAt: true,
      plan: { select: { slug: true, name: true } },
    },
  });
  if (!organization) return fail("Organization not found.", "NOT_FOUND");
  if (!organization.complimentaryPlanId) {
    return fail("This organization has no complimentary upgrade.", "CONFLICT");
  }

  const freePlan = await db.plan.findUnique({
    where: { slug: "free" },
    select: { id: true, name: true },
  });
  if (!freePlan) return fail("Free plan is missing.", "INTERNAL_ERROR");

  await db.$transaction([
    db.organization.update({
      where: { id: organization.id },
      data: {
        planId: freePlan.id,
        subscriptionStatus: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        graceStartedAt: null,
        graceEndsAt: null,
        dunningStage: 0,
        dunningLastNoticeAt: null,
        pendingPlanId: null,
        pendingBillingInterval: null,
        pendingChangeAt: null,
        complimentaryPlanId: null,
        complimentaryExpiresAt: null,
        complimentaryGrantedById: null,
        complimentaryGrantedAt: null,
        complimentaryPreviousPlanId: null,
        complimentaryNote: null,
      },
    }),
    db.adminAuditLog.create({
      data: {
        adminUserId: admin.id,
        action: "subscription.complimentary_revoke",
        targetType: "Organization",
        targetId: organization.id,
        metadata: {
          previousPlanId: organization.planId,
          previousPlanSlug: organization.plan.slug,
          complimentaryPlanId: organization.complimentaryPlanId,
          complimentaryExpiresAt: organization.complimentaryExpiresAt?.toISOString() ?? null,
          revertedToPlanId: freePlan.id,
        },
      },
    }),
  ]);

  revalidateSubscriptionViews();
  return ok({ revoked: true });
}

export async function updatePlanCatalog(
  input: unknown,
): Promise<ActionResult<{ updated: true }>> {
  const parsed = updatePlanSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      parsed.error.issues[0]?.message ?? "Invalid plan details.",
      "VALIDATION_ERROR",
    );
  }

  const admin = await requirePlatformAdmin();
  const existing = await db.plan.findUnique({
    where: { id: parsed.data.planId },
  });
  if (!existing) return fail("Plan not found.", "NOT_FOUND");

  if (existing.slug === "free") {
    if (parsed.data.monthlyPriceCents !== 0 || parsed.data.annualPriceCents !== 0) {
      return fail("The Free plan must remain $0.", "VALIDATION_ERROR");
    }
  }

  await db.$transaction([
    db.plan.update({
      where: { id: existing.id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description?.trim() || null,
        monthlyPriceCents: parsed.data.monthlyPriceCents,
        annualPriceCents: parsed.data.annualPriceCents,
        currency: parsed.data.currency.toUpperCase(),
        studentLimit: parsed.data.studentLimit,
        monthlyLiveLessonMinutes: parsed.data.monthlyLiveLessonMinutes,
        features: parsed.data.features,
        marketplaceListing: parsed.data.marketplaceListing,
        videoSessions: parsed.data.videoSessions,
        teacherPayments: parsed.data.teacherPayments,
        highlighted: parsed.data.highlighted,
        sortOrder: parsed.data.sortOrder,
        isPublic: parsed.data.isPublic,
      },
    }),
    db.adminAuditLog.create({
      data: {
        adminUserId: admin.id,
        action: "plan.update",
        targetType: "Plan",
        targetId: existing.id,
        metadata: {
          before: existing,
          after: parsed.data,
        },
      },
    }),
  ]);

  revalidateSubscriptionViews();
  return ok({ updated: true });
}

export async function createPlanSale(
  input: unknown,
): Promise<ActionResult<{ saleId: string }>> {
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      parsed.error.issues[0]?.message ?? "Invalid sale details.",
      "VALIDATION_ERROR",
    );
  }

  const admin = await requirePlatformAdmin();
  const plans = await db.plan.findMany({
    where: { id: { in: parsed.data.planIds } },
    select: { id: true },
  });
  if (plans.length !== parsed.data.planIds.length) {
    return fail("One or more selected plans were not found.", "NOT_FOUND");
  }

  const sale = await db.$transaction(async (tx) => {
    const created = await tx.planSale.create({
      data: {
        name: parsed.data.name,
        percentOff: parsed.data.percentOff,
        paddleDiscountId: parsed.data.paddleDiscountId,
        startsAt: new Date(parsed.data.startsAt),
        endsAt: new Date(parsed.data.endsAt),
        intervalScope: parsed.data.intervalScope,
        active: parsed.data.active,
        plans: {
          create: parsed.data.planIds.map((planId) => ({ planId })),
        },
      },
      select: { id: true },
    });
    await tx.adminAuditLog.create({
      data: {
        adminUserId: admin.id,
        action: "plan_sale.create",
        targetType: "PlanSale",
        targetId: created.id,
        metadata: parsed.data,
      },
    });
    return created;
  });

  revalidateSubscriptionViews();
  return ok({ saleId: sale.id });
}

export async function updatePlanSale(
  input: unknown,
): Promise<ActionResult<{ updated: true }>> {
  const parsed = saleSchema
    .extend({ saleId: uuid })
    .safeParse(input);
  if (!parsed.success) {
    return fail(
      parsed.error.issues[0]?.message ?? "Invalid sale details.",
      "VALIDATION_ERROR",
    );
  }

  const admin = await requirePlatformAdmin();
  const existing = await db.planSale.findUnique({
    where: { id: parsed.data.saleId },
    select: { id: true },
  });
  if (!existing) return fail("Sale not found.", "NOT_FOUND");

  const plans = await db.plan.findMany({
    where: { id: { in: parsed.data.planIds } },
    select: { id: true },
  });
  if (plans.length !== parsed.data.planIds.length) {
    return fail("One or more selected plans were not found.", "NOT_FOUND");
  }

  await db.$transaction(async (tx) => {
    await tx.planSalePlan.deleteMany({ where: { saleId: existing.id } });
    await tx.planSale.update({
      where: { id: existing.id },
      data: {
        name: parsed.data.name,
        percentOff: parsed.data.percentOff,
        paddleDiscountId: parsed.data.paddleDiscountId,
        startsAt: new Date(parsed.data.startsAt),
        endsAt: new Date(parsed.data.endsAt),
        intervalScope: parsed.data.intervalScope,
        active: parsed.data.active,
        plans: {
          create: parsed.data.planIds.map((planId) => ({ planId })),
        },
      },
    });
    await tx.adminAuditLog.create({
      data: {
        adminUserId: admin.id,
        action: "plan_sale.update",
        targetType: "PlanSale",
        targetId: existing.id,
        metadata: parsed.data,
      },
    });
  });

  revalidateSubscriptionViews();
  return ok({ updated: true });
}

export async function deactivatePlanSale(
  input: unknown,
): Promise<ActionResult<{ deactivated: true }>> {
  const parsed = z.object({ saleId: uuid }).safeParse(input);
  if (!parsed.success) return fail("Invalid sale.", "VALIDATION_ERROR");

  const admin = await requirePlatformAdmin();
  const existing = await db.planSale.findUnique({
    where: { id: parsed.data.saleId },
    select: { id: true, active: true },
  });
  if (!existing) return fail("Sale not found.", "NOT_FOUND");

  await db.$transaction([
    db.planSale.update({
      where: { id: existing.id },
      data: { active: false },
    }),
    db.adminAuditLog.create({
      data: {
        adminUserId: admin.id,
        action: "plan_sale.deactivate",
        targetType: "PlanSale",
        targetId: existing.id,
        metadata: { previousActive: existing.active },
      },
    }),
  ]);

  revalidateSubscriptionViews();
  return ok({ deactivated: true });
}
