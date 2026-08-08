import Link from "next/link";

import { Button } from "@/components/ui/button";

export function Cta() {
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-6 py-16 md:px-8 md:py-24">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-8 text-center shadow-sm md:p-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_80%_at_50%_120%,--alpha(var(--color-primary)/15%),transparent)]"
          />
          <div className="relative space-y-6">
            <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
              Ready to learn — or teach?
            </h2>
            <p className="mx-auto max-w-xl text-muted-foreground">
              Book a live lesson with a verified tutor, or open your own teaching business.
              Create a free account in under a minute.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Button size="lg" render={<Link href="/find-tutor" />}>
                Find a tutor
              </Button>
              <Button size="lg" variant="outline" render={<Link href="/register?role=teacher" />}>
                Become a teacher
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
