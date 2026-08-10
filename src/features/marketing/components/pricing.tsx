"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export type MarketingPlan = {
  id: string;
  name: string;
  slug: string;
  description: string;
  highlighted: boolean;
  currency: string;
  monthlyListCents: number;
  monthlyEffectiveCents: number;
  annualListCents: number;
  annualEffectiveCents: number;
  monthlyPercentOff: number;
  annualPercentOff: number;
  saleName: string | null;
  saleEndsAt: string | null;
  features: string[];
  cta: string;
};

export function Pricing({ plans }: { plans: MarketingPlan[] }) {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="scroll-mt-20 border-t border-border/60">
      <div className="mx-auto max-w-6xl space-y-12 px-6 py-16 md:px-8 md:py-24">
        {/*
          The heading names the thing being priced.

          "Simple, honest pricing" priced nothing in particular, and a visitor arriving at
          this section from a page about tutoring could reasonably read the figures as the
          cost of a lesson. They are not: they are the cost of the software, and the lesson
          fee never passes through us at all. Stating the two facts in the heading is worth
          more than the adjectives were.
        */}
        <div className="mx-auto max-w-2xl space-y-3 text-center">
          <p className="text-sm font-medium text-primary">For tutors and tutoring academies</p>
          <h2 className="text-3xl font-semibold tracking-tight">
            One subscription. No commission.
          </h2>
          <p className="text-muted-foreground">
            Every tier is a software subscription — scheduling, live video classrooms and
            student management. Start free, then raise your student and live-lesson limits as
            your practice grows. Students pay you directly for lessons, and we take 0% of it.
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
          {plans.map((plan) => {
            const listCents = annual ? plan.annualListCents : plan.monthlyListCents;
            const effectiveCents = annual
              ? plan.annualEffectiveCents
              : plan.monthlyEffectiveCents;
            const percentOff = annual ? plan.annualPercentOff : plan.monthlyPercentOff;
            const annualSavingCents = plan.monthlyListCents * 12 - plan.annualListCents;

            return (
              <div
                key={plan.id}
                className={cn(
                  "flex flex-col space-y-6 rounded-xl border bg-card p-8 shadow-sm",
                  plan.highlighted
                    ? "border-primary/50 ring-1 ring-primary/30"
                    : "border-border",
                )}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                    {percentOff > 0 ? (
                      <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600">
                        {percentOff}% off
                      </span>
                    ) : plan.highlighted ? (
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                        Most popular
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-4xl font-bold tracking-tight">
                      {formatCurrency(effectiveCents, plan.currency)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      / {plan.monthlyListCents === 0 ? "forever" : annual ? "year" : "month"}
                    </span>
                  </div>
                  {percentOff > 0 ? (
                    <p className="text-xs text-muted-foreground line-through">
                      {formatCurrency(listCents, plan.currency)}
                    </p>
                  ) : null}
                  {annual && annualSavingCents > 0 && percentOff === 0 ? (
                    <p className="text-xs font-medium text-emerald-500">
                      Save {formatCurrency(annualSavingCents, plan.currency)} per year
                    </p>
                  ) : null}
                  {plan.saleName && percentOff > 0 ? (
                    <p className="text-xs font-medium text-emerald-600">{plan.saleName}</p>
                  ) : null}
                </div>

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
            );
          })}
        </div>
      </div>
    </section>
  );
}
