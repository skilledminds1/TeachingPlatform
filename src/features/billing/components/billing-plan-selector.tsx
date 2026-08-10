"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  cancelScheduledPlanChange,
  createSubscriptionCheckout,
  resumeSubscription,
  schedulePlanChange,
  scheduleSubscriptionCancellation,
} from "@/actions/billing";
import { Button } from "@/components/ui/button";
import { planFeatureLabels } from "@/features/billing/lib/plan-feature-labels";
import { openPaddleCheckout } from "@/services/paddle/checkout-client";
import { cn } from "@/lib/utils";

type BillingPlan = {
  slug: string;
  name: string;
  monthlyPriceCents: number;
  annualPriceCents: number;
  monthlyEffectiveCents: number;
  annualEffectiveCents: number;
  monthlyPercentOff: number;
  annualPercentOff: number;
  saleName: string | null;
  currency: string;
  studentLimit: number | null;
  monthlyLiveLessonMinutes: number | null;
  features: string[];
  highlighted?: boolean;
};

/**
 * Hand a checkout result to whichever rail produced it.
 *
 * Paddle opens an overlay and the page stays
 * put. Keeping the branch here rather than at each call site means a future rail is one arm of
 * this switch, not another pair of places to remember.
 */
async function startCheckout(
  data:
    | { mode: "redirect"; url: string; fields: Record<string, string> }
    | {
        mode: "paddle";
        priceId: string;
        organizationId: string;
        email: string;
        discountId: string | null;
      },
): Promise<void> {
  if (data.mode === "paddle") {
    await openPaddleCheckout({
      priceId: data.priceId,
      organizationId: data.organizationId,
      email: data.email,
      discountId: data.discountId,
      // Paddle confirms in the overlay; this brings them back to a page that reflects the new
      // plan rather than leaving them looking at the old one.
      successUrl: `${window.location.origin}/dashboard/teacher/billing?checkout=return`,
    });
    return;
  }
  submitHostedForm(data.url, data.fields);
}

function submitHostedForm(url: string, fields: Record<string, string>): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = url;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

export function BillingPlanSelector({
  plans,
  currentPlan,
  currentInterval,
  checkoutConfigured,
  autoCheckoutPlan,
  autoCheckoutInterval,
  pendingPlan,
  pendingChangeAt,
  subscriptionStatus,
  currentPeriodEnd,
  cancelAtPeriodEnd,
  graceStartedAt,
  graceEndsAt,
}: {
  plans: BillingPlan[];
  currentPlan: string;
  currentInterval: "monthly" | "annual";
  checkoutConfigured: boolean;
  autoCheckoutPlan?: "starter" | "professional" | "business";
  autoCheckoutInterval?: "monthly" | "annual";
  pendingPlan: { slug: string; name: string } | null;
  pendingChangeAt: Date | null;
  subscriptionStatus: "active" | "past_due" | "cancelled";
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  graceStartedAt: Date | null;
  graceEndsAt: Date | null;
}) {
  const router = useRouter();
  const [interval, setInterval] = useState<"monthly" | "annual">(
    autoCheckoutInterval ?? currentInterval,
  );
  const [pendingChoice, setPendingChoice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const autoStarted = useRef(false);

  function choosePlan(plan: BillingPlan, billingInterval = interval): void {
    if (plan.slug === currentPlan && billingInterval === currentInterval) {
      toast.message(`You are already on ${plan.name}.`);
      return;
    }
    setPendingChoice(plan.slug);
    startTransition(async () => {
      const currentPrice =
        plans.find((item) => item.slug === currentPlan)?.monthlyPriceCents ?? 0;
      if (plan.monthlyPriceCents < currentPrice) {
        const scheduled = await schedulePlanChange({
          planSlug: plan.slug,
          interval: billingInterval,
        });
        setPendingChoice(null);
        if (!scheduled.success) {
          toast.error(scheduled.error);
          return;
        }
        toast.warning(scheduled.data.warning);
        router.refresh();
        return;
      }
      const result = await createSubscriptionCheckout({
        planSlug: plan.slug,
        interval: billingInterval,
      });
      if (!result.success) {
        setPendingChoice(null);
        toast.error(result.error);
        return;
      }
      if (result.data.mode === "updated" || result.data.mode === "local") {
        setPendingChoice(null);
        toast.success(
          result.data.mode === "local"
            ? `${result.data.planName} activated for local testing (checkout skipped on localhost).`
            : `${plan.name} activated.`,
        );
        router.refresh();
        return;
      }
      await startCheckout(result.data);
    });
  }

  useEffect(() => {
    if (autoStarted.current || !autoCheckoutPlan || !checkoutConfigured) return;
    const plan = plans.find((item) => item.slug === autoCheckoutPlan);
    if (!plan || plan.slug === "free") return;
    const billingInterval = autoCheckoutInterval ?? interval;
    if (plan.slug === currentPlan && billingInterval === currentInterval) return;
    autoStarted.current = true;

    let cancelled = false;
    void (async () => {
      const result = await createSubscriptionCheckout({
        planSlug: plan.slug,
        interval: billingInterval,
      });
      if (cancelled) return;
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      if (result.data.mode === "updated" || result.data.mode === "local") {
        toast.success(
          result.data.mode === "local"
            ? `${result.data.planName} activated for local testing (checkout skipped on localhost).`
            : `${plan.name} activated.`,
        );
        router.refresh();
        return;
      }
      await startCheckout(result.data);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    autoCheckoutInterval,
    autoCheckoutPlan,
    currentInterval,
    currentPlan,
    interval,
    checkoutConfigured,
    plans,
    router,
  ]);

  return (
    <div className="space-y-6">
      {subscriptionStatus === "past_due" && graceStartedAt && graceEndsAt ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm">
          <p className="font-medium">Payment recovery period</p>
          <p className="mt-1">
            Payment failed on {new Date(graceStartedAt).toLocaleDateString()}. New bookings and
            publishing pause after day 7. Existing paid lessons remain available. Recover before{" "}
            {new Date(graceEndsAt).toLocaleDateString()} to avoid a read-only Free fallback.
          </p>
        </div>
      ) : null}
      {subscriptionStatus === "cancelled" ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm">
          Billing was not recovered in time. Lessons already booked go ahead as normal, but growth
          actions are read-only until you start a paid checkout.
        </div>
      ) : null}
      {cancelAtPeriodEnd && currentPeriodEnd ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <p>
            Your paid subscription ends {new Date(currentPeriodEnd).toLocaleDateString()}, then
            moves to Free. Existing records remain; Free limits apply to new activity.
          </p>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await resumeSubscription();
                if (!result.success) toast.error(result.error);
                else {
                  toast.success("Subscription cancellation reversed.");
                  router.refresh();
                }
              })
            }
          >
            Keep subscription
          </Button>
        </div>
      ) : currentPlan !== "free" && currentPeriodEnd ? (
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4 text-sm">
          <span>Cancel at period end and move to Free without deleting existing records.</span>
          <Button
            size="sm"
            variant="destructive"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await scheduleSubscriptionCancellation();
                if (!result.success) toast.error(result.error);
                else {
                  toast.warning(
                    `Cancellation scheduled for ${new Date(result.data.effectiveAt).toLocaleDateString()}.`,
                  );
                  router.refresh();
                }
              })
            }
          >
            Cancel subscription
          </Button>
        </div>
      ) : null}
      {pendingPlan && pendingChangeAt ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <p className="font-medium">
            {pendingPlan.name} is scheduled for {new Date(pendingChangeAt).toLocaleDateString()}.
          </p>
          <p className="mt-1 text-muted-foreground">
            Its lower student and lesson limits apply on that date. Existing bookings and lesson
            history stay available.
          </p>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await cancelScheduledPlanChange();
                if (!result.success) toast.error(result.error);
                else {
                  toast.success("Scheduled plan change cancelled.");
                  router.refresh();
                }
              })
            }
          >
            Keep current plan
          </Button>
        </div>
      ) : null}
      <div className="flex w-fit items-center rounded-lg border border-border bg-card p-1">
        <Button
          size="sm"
          variant={interval === "monthly" ? "default" : "ghost"}
          onClick={() => setInterval("monthly")}
        >
          Monthly
        </Button>
        <Button
          size="sm"
          variant={interval === "annual" ? "default" : "ghost"}
          onClick={() => setInterval("annual")}
        >
          Annual · save 2 months
        </Button>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const current = plan.slug === currentPlan && interval === currentInterval;
          const listPrice =
            interval === "annual" ? plan.annualPriceCents : plan.monthlyPriceCents;
          const price =
            interval === "annual"
              ? plan.annualEffectiveCents
              : plan.monthlyEffectiveCents;
          const percentOff =
            interval === "annual" ? plan.annualPercentOff : plan.monthlyPercentOff;
          const annualSaving =
            (plan.monthlyPriceCents * 12 - plan.annualPriceCents) / 100;
          return (
            <div
              key={plan.slug}
              className={cn(
                "flex flex-col rounded-xl border bg-card p-5 shadow-sm",
                plan.highlighted || plan.slug === "professional"
                  ? "border-primary/50 ring-1 ring-primary/20"
                  : "",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{plan.name}</h2>
                {percentOff > 0 ? (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
                    {percentOff}% off
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-bold">${price / 100}</span>
                <span className="text-xs text-muted-foreground">
                  /{plan.slug === "free" ? "forever" : interval === "annual" ? "year" : "month"}
                </span>
              </div>
              {percentOff > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground line-through">
                  ${listPrice / 100}
                </p>
              ) : null}
              {interval === "annual" && annualSaving > 0 && percentOff === 0 ? (
                <p className="mt-1 text-xs font-medium text-emerald-500">
                  Save ${annualSaving}
                </p>
              ) : null}
              {plan.saleName && percentOff > 0 ? (
                <p className="mt-1 text-xs font-medium text-emerald-600">{plan.saleName}</p>
              ) : null}
              <p className="mt-4 text-sm font-medium">
                {plan.studentLimit === null
                  ? "Unlimited active students"
                  : `${plan.studentLimit} active student${plan.studentLimit === 1 ? "" : "s"}`}
              </p>
              <p className="mt-1 text-sm font-medium">
                {plan.monthlyLiveLessonMinutes === null
                  ? "Unlimited live lessons (fair use)"
                  : `${plan.monthlyLiveLessonMinutes / 60} live lesson hours / month`}
              </p>
              <ul className="mt-4 flex-1 space-y-2">
                {plan.features
                  .filter((feature) => planFeatureLabels[feature])
                  .slice(-7)
                  .map((feature) => (
                    <li key={feature} className="flex gap-2 text-xs text-muted-foreground">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                      {planFeatureLabels[feature]}
                    </li>
                  ))}
              </ul>
              <Button
                className="mt-6 w-full"
                variant={current ? "outline" : "default"}
                disabled={
                  current ||
                  (plan.slug !== "free" && !checkoutConfigured) ||
                  (isPending && pendingChoice === plan.slug)
                }
                onClick={() => choosePlan(plan)}
              >
                {current
                  ? "Current plan"
                  : plan.slug === "free"
                    ? "Schedule Free"
                    : isPending && pendingChoice === plan.slug
                      ? "Redirecting to checkout…"
                      : `Choose ${plan.name}`}
              </Button>
            </div>
          );
        })}
      </div>

      {!checkoutConfigured ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Checkout is disabled until billing is configured.
        </p>
      ) : null}
    </div>
  );
}
