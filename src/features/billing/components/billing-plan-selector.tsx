"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { createSubscriptionCheckout } from "@/actions/billing";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const featureLabels: Record<string, string> = {
  teacher_profile: "Teacher profile",
  marketplace_listing: "Find Tutor & Courses listing",
  booking_calendar: "Booking calendar",
  direct_messaging: "Direct messaging",
  one_on_one_lessons: "One-on-one lessons",
  basic_analytics: "Basic analytics",
  community_support: "Community support",
  direct_payments: "Direct payment linking",
  courses: "Course creation & sales",
  homework: "Homework",
  file_sharing: "File sharing",
  student_notes: "Student notes",
  email_reminders: "Email reminders",
  reviews: "Reviews",
  basic_reporting: "Basic reporting",
  custom_availability: "Custom availability",
  unlimited_courses: "Unlimited courses · 0% commission",
  quizzes: "Quizzes",
  assignments: "Assignments",
  certificates: "Certificates",
  group_lessons: "Group lessons",
  calendar_sync: "Calendar sync",
  video_integrations: "HD video lessons",
  advanced_analytics: "Advanced analytics",
  priority_support: "Priority support",
  team_teachers: "Team teachers",
  custom_branding: "Custom branding",
  api_access: "API access (future)",
  white_label_certificates: "White-label certificates",
  advanced_reporting: "Advanced reporting",
  automation: "Automation",
  early_access: "Early access",
};

type BillingPlan = {
  slug: string;
  name: string;
  monthlyPriceCents: number;
  annualPriceCents: number;
  currency: string;
  studentLimit: number | null;
  monthlyLiveLessonMinutes: number | null;
  courseLimit: number | null;
  features: string[];
};

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
  payfastConfigured,
  autoCheckoutPlan,
  autoCheckoutInterval,
}: {
  plans: BillingPlan[];
  currentPlan: string;
  currentInterval: "monthly" | "annual";
  payfastConfigured: boolean;
  autoCheckoutPlan?: "starter" | "professional" | "business";
  autoCheckoutInterval?: "monthly" | "annual";
}) {
  const router = useRouter();
  const [interval, setInterval] = useState<"monthly" | "annual">(
    autoCheckoutInterval ?? currentInterval,
  );
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const autoStarted = useRef(false);

  function choosePlan(plan: BillingPlan, billingInterval = interval): void {
    if (plan.slug === "free") return;
    if (plan.slug === currentPlan && billingInterval === currentInterval) {
      toast.message(`You are already on ${plan.name}.`);
      return;
    }
    setPendingPlan(plan.slug);
    startTransition(async () => {
      const result = await createSubscriptionCheckout({
        planSlug: plan.slug,
        interval: billingInterval,
      });
      if (!result.success) {
        setPendingPlan(null);
        toast.error(result.error);
        return;
      }
      if (result.data.mode === "updated" || result.data.mode === "local") {
        setPendingPlan(null);
        toast.success(
          result.data.mode === "local"
            ? `${result.data.planName} activated for local testing (PayFast skipped on localhost).`
            : `${plan.name} activated.`,
        );
        router.refresh();
        return;
      }
      submitHostedForm(result.data.url, result.data.fields);
    });
  }

  useEffect(() => {
    if (autoStarted.current || !autoCheckoutPlan || !payfastConfigured) return;
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
            ? `${result.data.planName} activated for local testing (PayFast skipped on localhost).`
            : `${plan.name} activated.`,
        );
        router.refresh();
        return;
      }
      submitHostedForm(result.data.url, result.data.fields);
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
    payfastConfigured,
    plans,
    router,
  ]);

  return (
    <div className="space-y-6">
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
          const price =
            interval === "annual" ? plan.annualPriceCents : plan.monthlyPriceCents;
          const annualSaving =
            (plan.monthlyPriceCents * 12 - plan.annualPriceCents) / 100;
          return (
            <div
              key={plan.slug}
              className={cn(
                "flex flex-col rounded-xl border bg-card p-5 shadow-sm",
                plan.slug === "professional" ? "border-primary/50 ring-1 ring-primary/20" : "",
              )}
            >
              <h2 className="font-semibold">{plan.name}</h2>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-bold">${price / 100}</span>
                <span className="text-xs text-muted-foreground">
                  /{plan.slug === "free" ? "forever" : interval === "annual" ? "year" : "month"}
                </span>
              </div>
              {interval === "annual" && annualSaving > 0 ? (
                <p className="mt-1 text-xs font-medium text-emerald-500">
                  Save ${annualSaving}
                </p>
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
              <p className="mt-1 text-sm text-muted-foreground">
                {plan.courseLimit === 0
                  ? "Course selling not included"
                  : plan.courseLimit === null
                  ? "Unlimited courses"
                  : `${plan.courseLimit} course`}
              </p>
              <ul className="mt-4 flex-1 space-y-2">
                {plan.features
                  .filter((feature) => featureLabels[feature])
                  .slice(-7)
                  .map((feature) => (
                    <li key={feature} className="flex gap-2 text-xs text-muted-foreground">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                      {featureLabels[feature]}
                    </li>
                  ))}
              </ul>
              <Button
                className="mt-6 w-full"
                variant={current ? "outline" : "default"}
                disabled={
                  current ||
                  plan.slug === "free" ||
                  !payfastConfigured ||
                  (isPending && pendingPlan === plan.slug)
                }
                onClick={() => choosePlan(plan)}
              >
                {current
                  ? "Current plan"
                  : plan.slug === "free"
                    ? "Free"
                    : isPending && pendingPlan === plan.slug
                      ? "Opening PayFast…"
                      : `Choose ${plan.name}`}
              </Button>
            </div>
          );
        })}
      </div>

      {!payfastConfigured ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Checkout is disabled until the PayFast merchant credentials and USD/ZAR billing rate are
          configured.
        </p>
      ) : null}
    </div>
  );
}
