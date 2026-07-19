import { BadgeCheck, Banknote, CalendarRange, TrendingUp } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const benefits = [
  {
    icon: Banknote,
    title: "Keep 100% of your lesson fees",
    description:
      "Students pay you directly via your own PayPal or PayFast account. We never touch your earnings — you only pay a flat subscription.",
  },
  {
    icon: CalendarRange,
    title: "Your schedule, your rates",
    description:
      "Set weekly availability, hourly rates, and cancellation policies. Bookings fit around your life.",
  },
  {
    icon: BadgeCheck,
    title: "A profile that sells for you",
    description:
      "Verified badge, moderated reviews, and marketplace search put your practice in front of new students.",
  },
  {
    icon: TrendingUp,
    title: "Grow from solo to academy",
    description:
      "Start free, upgrade as you grow, and bring your whole team when you're ready for organization plans.",
  },
] as const;

export function ForTeachers() {
  return (
    <section id="for-teachers" className="scroll-mt-20 border-t border-border/60 bg-card/40">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 md:px-8 md:py-24 lg:grid-cols-2 lg:items-center">
        <div className="space-y-6">
          <h2 className="text-3xl font-semibold tracking-tight text-balance">
            Built for teachers who mean business
          </h2>
          <p className="text-lg text-muted-foreground">
            Stop juggling WhatsApp, spreadsheets, and bank transfers. Run your entire tutoring
            practice from one professional platform.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" render={<Link href="/register?role=teacher" />}>
              Start teaching — it&apos;s free
            </Button>
            <Button size="lg" variant="outline" render={<Link href="/#pricing" />}>
              View pricing
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {benefits.map((benefit) => (
            <div
              key={benefit.title}
              className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm"
            >
              <benefit.icon className="size-5 text-primary" aria-hidden />
              <h3 className="text-base font-semibold">{benefit.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {benefit.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
