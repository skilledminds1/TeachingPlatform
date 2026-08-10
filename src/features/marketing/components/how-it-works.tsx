import { Calendar, Search, Video } from "lucide-react";

const livePath = [
  {
    icon: Search,
    step: "01",
    title: "Discover tutors",
    description: "Browse verified teachers by subject, rating, and availability.",
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

function StepList({
  steps,
}: {
  steps: ReadonlyArray<{
    icon: typeof Search;
    step: string;
    title: string;
    description: string;
  }>;
}) {
  return (
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
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-t border-border/60 bg-card/40">
      <div className="mx-auto max-w-6xl space-y-12 px-6 py-16 md:px-8 md:py-24">
        <div className="space-y-3 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
          {/*
            Says who these three steps belong to. The page now opens by addressing a tutor,
            and without this line the reader is handed a student's journey with no warning
            that the audience just changed.
          */}
          <p className="text-muted-foreground">
            For students: three steps from finding a tutor to the first lesson
          </p>
        </div>

        <StepList steps={livePath} />
      </div>
    </section>
  );
}
