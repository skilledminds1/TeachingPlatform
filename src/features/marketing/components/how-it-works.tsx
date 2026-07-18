import { BookOpen, Calendar, Video } from "lucide-react";

const steps = [
  {
    icon: BookOpen,
    step: "01",
    title: "Discover tutors",
    description:
      "Browse verified teachers by subject, rating, and availability on our marketplace.",
  },
  {
    icon: Calendar,
    step: "02",
    title: "Book a session",
    description:
      "Pick a time that works for you. Pay your tutor directly via their preferred method.",
  },
  {
    icon: Video,
    step: "03",
    title: "Learn live",
    description:
      "Join a high-quality video session right in your browser — no downloads required.",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-t border-border/60 bg-card/40">
      <div className="mx-auto max-w-6xl space-y-12 px-6 py-16 md:px-8 md:py-24">
        <div className="space-y-3 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
          <p className="text-muted-foreground">Three simple steps to your next lesson</p>
        </div>
        <ol className="grid gap-6 md:grid-cols-3 md:gap-8">
          {steps.map((step) => (
            <li
              key={step.title}
              className="space-y-4 rounded-xl border border-border bg-card p-8 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <step.icon className="size-5" aria-hidden />
                </div>
                <span className="text-sm font-semibold text-muted-foreground/60">
                  {step.step}
                </span>
              </div>
              <h3 className="text-xl font-semibold">{step.title}</h3>
              <p className="text-muted-foreground">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
