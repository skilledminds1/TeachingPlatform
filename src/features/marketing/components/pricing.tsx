import { Check } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const plans = [
  {
    name: "Free",
    price: "R0",
    period: "forever",
    description: "For new teachers exploring the platform",
    highlighted: false,
    cta: "Start free",
    features: ["Up to 5 students", "1 teacher seat", "Booking calendar", "Student messaging"],
  },
  {
    name: "Pro",
    price: "R299",
    period: "per month",
    description: "For solo teachers building a practice",
    highlighted: true,
    cta: "Start 14-day trial",
    features: [
      "Up to 50 students",
      "Marketplace listing",
      "Live video sessions",
      "Direct student payments",
      "Reviews & verified badge",
    ],
  },
  {
    name: "Academy",
    price: "R799",
    period: "per month",
    description: "For training organizations and teams",
    highlighted: false,
    cta: "Start 14-day trial",
    features: [
      "Up to 250 students",
      "Up to 10 teachers",
      "Everything in Pro",
      "Team management",
      "Priority support",
    ],
  },
] as const;

export function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 border-t border-border/60">
      <div className="mx-auto max-w-6xl space-y-12 px-6 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-2xl space-y-3 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Simple, honest pricing</h2>
          <p className="text-muted-foreground">
            Free for students. Teachers pay one flat subscription — and keep every rand they earn
            from lessons.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
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
                <span className="text-4xl font-bold tracking-tight">{plan.price}</span>
                <span className="text-sm text-muted-foreground">/ {plan.period}</span>
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
                render={<Link href="/register?role=teacher" />}
              >
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Subscriptions billed securely via PayFast. Cancel anytime — no lock-in.
        </p>
      </div>
    </section>
  );
}
