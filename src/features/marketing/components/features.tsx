import {
  CalendarClock,
  CreditCard,
  MessagesSquare,
  ShieldCheck,
  Star,
  Video,
} from "lucide-react";

const features = [
  {
    icon: ShieldCheck,
    title: "Verified teachers",
    description:
      "Every profile is reviewed and approved before it goes live — qualifications, rates, and payment details included.",
  },
  {
    icon: Video,
    title: "Live video classroom",
    description:
      "Lessons run in your browser — nothing to install, on any device. Join from the booking with one click when it is time.",
  },
  {
    icon: CreditCard,
    title: "Direct payments",
    description:
      "Students pay teachers directly through the teacher's own payment account. No middleman, no payout delays.",
  },
  {
    icon: CalendarClock,
    title: "Smart scheduling",
    description:
      "Teachers set weekly availability once. Students book open slots in their own timezone — conflicts handled automatically.",
  },
  {
    icon: MessagesSquare,
    title: "Talk before you book",
    description:
      "Message a teacher about what you need and agree the plan first, so the first lesson starts with the teaching rather than the admin.",
  },
  {
    icon: Star,
    title: "Honest reviews",
    description:
      "Only students who completed a lesson can leave a review, and every review is moderated before publishing.",
  },
] as const;

export function Features() {
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-6xl space-y-12 px-6 py-16 md:px-8 md:py-24">
        <div className="mx-auto max-w-2xl space-y-3 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">
            Everything you need to teach and learn
          </h2>
          <p className="text-muted-foreground">
            Discovery, scheduling, video, and payments — one complete toolkit, without the
            busywork
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="space-y-3 rounded-xl border border-border bg-card p-6 shadow-sm transition-colors duration-200 hover:border-primary/30"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <feature.icon className="size-5" aria-hidden />
              </div>
              <h3 className="text-lg font-semibold">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
