import {
  BookOpen,
  Calculator,
  FlaskConical,
  Languages,
  Music,
  ShieldCheck,
  Sparkles,
  Star,
  Video,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const trustPoints = [
  { icon: ShieldCheck, label: "Verified teachers" },
  { icon: Video, label: "Live 1-on-1 lessons" },
  { icon: BookOpen, label: "Self-paced courses" },
  { icon: Star, label: "Reviewed by real students" },
] as const;

const floatingSubjects = [
  {
    icon: Calculator,
    label: "Mathematics",
    className: "left-[1%] top-[14%] -rotate-6 xl:left-[4%]",
    chip: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    delay: "0s",
  },
  {
    icon: FlaskConical,
    label: "Science",
    className: "right-[1%] top-[12%] rotate-5 xl:right-[4%]",
    chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    delay: "0.6s",
  },
  {
    icon: Languages,
    label: "Languages",
    className: "left-[2%] bottom-[18%] rotate-3 xl:left-[6%]",
    chip: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    delay: "1.2s",
  },
  {
    icon: Music,
    label: "Music",
    className: "right-[2%] bottom-[20%] -rotate-4 xl:right-[6%]",
    chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    delay: "1.8s",
  },
  {
    icon: BookOpen,
    label: "English",
    className: "right-[1%] top-[48%] rotate-2 xl:right-[8%]",
    chip: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    delay: "0.9s",
  },
] as const;

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Layered atmospheric background */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(ellipse_70%_55%_at_50%_-5%,--alpha(var(--color-primary)/22%),transparent_70%)]" />
        <div className="absolute inset-x-0 top-24 h-[420px] bg-[radial-gradient(ellipse_50%_45%_at_80%_10%,oklch(0.7_0.18_290_/_0.14),transparent_65%)]" />
        <div className="absolute inset-x-0 top-32 h-[380px] bg-[radial-gradient(ellipse_45%_40%_at_15%_20%,oklch(0.75_0.12_200_/_0.12),transparent_60%)]" />
        <div
          className="absolute inset-x-0 top-0 h-[520px] opacity-[0.35] [mask-image:linear-gradient(to_bottom,black_40%,transparent)]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, color-mix(in oklch, var(--color-foreground) 18%, transparent) 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />
      </div>

      {/* Decorative doodles */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
        <span className="absolute top-28 left-[12%] size-2 rounded-full bg-primary/40" />
        <span className="absolute top-40 right-[14%] size-1.5 rounded-full bg-violet-400/50" />
        <svg
          className="absolute top-36 right-[22%] size-5 text-amber-400/70"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 2l1.4 7.2L20 12l-6.6 2.8L12 22l-1.4-7.2L4 12l6.6-2.8L12 2z" />
        </svg>
        <svg
          className="absolute bottom-36 left-[20%] size-4 text-sky-400/60"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </div>

      {/* Floating subject cards — desktop only */}
      <ul aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
        {floatingSubjects.map((subject) => (
          <li
            key={subject.label}
            className={`animate-hero-float absolute ${subject.className}`}
            style={{ animationDelay: subject.delay }}
          >
            <div className="flex items-center gap-2.5 rounded-2xl border border-border/60 bg-background/70 px-3.5 py-2.5 shadow-lg shadow-black/5 backdrop-blur-md dark:shadow-black/30">
              <span
                className={`flex size-8 items-center justify-center rounded-xl ${subject.chip}`}
              >
                <subject.icon className="size-4" />
              </span>
              <span className="font-heading text-sm font-semibold tracking-tight">
                {subject.label}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-20 md:px-8 md:pt-28 md:pb-28">
        <div className="animate-hero-fade-up mx-auto max-w-3xl space-y-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/35 bg-primary/12 px-3.5 py-1.5 text-sm font-medium text-foreground shadow-sm shadow-primary/10">
            <Sparkles className="size-3.5 text-primary" aria-hidden />
            Live tutoring and self-paced courses in one place
          </div>

          <h1 className="font-heading text-5xl font-bold tracking-tight text-balance md:text-7xl">
            One platform.
            <br />
            <span className="relative inline-block">
              <span className="bg-linear-to-r from-primary via-violet-500 to-sky-500 bg-clip-text text-transparent">
                Every way to learn.
              </span>
              <svg
                aria-hidden
                className="absolute -bottom-2 left-0 w-full text-primary/50"
                viewBox="0 0 300 12"
                fill="none"
                preserveAspectRatio="none"
              >
                <path
                  d="M2 8c40-6 80-8 150-4s100 2 146-2"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </h1>

          <p className="mx-auto max-w-2xl text-lg text-muted-foreground md:text-xl">
            Book live 1-on-1 lessons with verified tutors, or learn at your own pace with
            self-paced courses — built by the same expert teachers. Pay teachers directly,
            with no platform markup.
          </p>

          <div className="flex flex-col items-center justify-center gap-4 pt-4 sm:flex-row">
            <Button
              size="lg"
              className="shadow-lg shadow-primary/25 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/30"
              render={<Link href="/find-tutor" />}
            >
              Find a tutor
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="transition-transform duration-200 hover:-translate-y-0.5"
              render={<Link href="/courses" />}
            >
              Browse courses
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            Are you an educator?{" "}
            <Link
              href="/register?role=teacher"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Teach live lessons and sell courses
            </Link>
          </p>
        </div>

        <ul className="mx-auto mt-14 flex max-w-3xl flex-wrap items-center justify-center gap-3">
          {trustPoints.map((point) => (
            <li
              key={point.label}
              className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3.5 py-1.5 text-sm text-muted-foreground backdrop-blur-sm"
            >
              <point.icon className="size-3.5 text-primary" aria-hidden />
              {point.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
