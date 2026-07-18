import { ShieldCheck, Star, Video } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

const trustPoints = [
  { icon: ShieldCheck, label: "Verified teachers" },
  { icon: Video, label: "Live video lessons" },
  { icon: Star, label: "Reviewed by real students" },
] as const;

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,--alpha(var(--color-primary)/18%),transparent)]"
      />
      <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-16 md:px-8 md:pt-28 md:pb-24">
        <div className="mx-auto max-w-3xl space-y-6 text-center">
          <p className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            Online tutoring marketplace · Built for South Africa
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-balance md:text-6xl">
            Find the perfect tutor.
            <br />
            Learn live, online.
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground md:text-xl">
            Connect with expert teachers, book sessions in minutes, and join live video lessons —
            all in one place. Pay your tutor directly, with no platform markup.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 pt-4 sm:flex-row">
            <Button size="lg" render={<Link href="/register" />}>
              Find a tutor
            </Button>
            <Button size="lg" variant="outline" render={<Link href="/register?role=teacher" />}>
              Become a teacher
            </Button>
          </div>
        </div>

        <ul className="mx-auto mt-14 flex max-w-2xl flex-col items-center justify-center gap-4 sm:flex-row sm:gap-10">
          {trustPoints.map((point) => (
            <li
              key={point.label}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <point.icon className="size-4 text-primary" aria-hidden />
              {point.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
