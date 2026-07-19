"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Free",
    slug: "free",
    monthlyPrice: 0,
    annualPrice: 0,
    annualSaving: 0,
    description: "Perfect for trying the platform.",
    highlighted: false,
    cta: "Start free",
    features: [
      "1 active student",
      "2 live lesson hours / month",
      "Teacher profile & public listing",
      "Booking calendar",
      "Direct messaging",
      "One-on-one lessons",
      "Basic analytics",
      "Community support",
    ],
  },
  {
    name: "Starter",
    slug: "starter",
    monthlyPrice: 12,
    annualPrice: 120,
    annualSaving: 24,
    description: "For new tutors.",
    highlighted: false,
    cta: "Choose Starter",
    features: [
      "5 active students",
      "20 live lesson hours / month",
      "Everything in Free",
      "Homework & file sharing",
      "Student notes",
      "Email reminders",
      "Reviews & basic reporting",
      "Custom availability",
      "Course selling not included",
    ],
  },
  {
    name: "Professional",
    slug: "professional",
    monthlyPrice: 29,
    annualPrice: 290,
    annualSaving: 58,
    description: "For growing businesses.",
    highlighted: true,
    cta: "Choose Professional",
    features: [
      "15 active students",
      "75 live lesson hours / month",
      "Up to 5 courses",
      "0% commission on course sales",
      "Quizzes, assignments & certificates",
      "Group lessons",
      "Calendar sync",
      "HD video lessons",
      "Advanced analytics & priority support",
    ],
  },
  {
    name: "Business",
    slug: "business",
    monthlyPrice: 49,
    annualPrice: 490,
    annualSaving: 98,
    description: "For serious educators and schools.",
    highlighted: false,
    cta: "Choose Business",
    features: [
      "Unlimited students",
      "Unlimited live lessons (fair use)",
      "Up to 10 courses",
      "0% commission on course sales",
      "Everything in Professional",
      "Team teachers",
      "Custom branding",
      "White-label certificates",
      "Advanced reporting & automation",
      "Early access to new features",
    ],
  },
] as const;

export function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="scroll-mt-20 border-t border-border/60">
      <div className="mx-auto max-w-6xl space-y-12 px-6 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-2xl space-y-3 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Simple, honest pricing</h2>
          <p className="text-muted-foreground">
            Start free, then unlock new teaching tools as your business grows. Professional and
            Business include course selling with zero platform commission.
          </p>
          <div className="mx-auto mt-6 flex w-fit items-center rounded-lg border border-border bg-card p-1">
            <Button
              size="sm"
              variant={annual ? "ghost" : "default"}
              onClick={() => setAnnual(false)}
            >
              Monthly
            </Button>
            <Button
              size="sm"
              variant={annual ? "default" : "ghost"}
              onClick={() => setAnnual(true)}
            >
              Annual
              <span className="text-xs opacity-80">Save 2 months</span>
            </Button>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "flex flex-col space-y-6 rounded-xl border bg-card p-8 shadow-sm",
                plan.highlighted
                  ? "border-primary/50 ring-1 ring-primary/30"
                  : "border-border",
              )}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  {plan.highlighted ? (
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      Most popular
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </div>

              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-bold tracking-tight">
                  ${annual ? plan.annualPrice : plan.monthlyPrice}
                </span>
                <span className="text-sm text-muted-foreground">
                  / {plan.monthlyPrice === 0 ? "forever" : annual ? "year" : "month"}
                </span>
              </div>
              {annual && plan.annualSaving > 0 ? (
                <p className="-mt-4 text-xs font-medium text-emerald-500">
                  Save ${plan.annualSaving} per year
                </p>
              ) : null}

              <ul className="flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                size="lg"
                variant={plan.highlighted ? "default" : "outline"}
                className="w-full"
                render={
                  <Link
                    href={
                      plan.slug === "free"
                        ? "/register?role=teacher"
                        : `/subscribe?plan=${plan.slug}&interval=${annual ? "annual" : "monthly"}`
                    }
                  />
                }
              >
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
