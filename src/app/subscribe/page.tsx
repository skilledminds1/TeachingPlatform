import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  getCurrentUser,
  hasTeacherMembership,
} from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Choose a plan",
  description: "Upgrade your Amazing Skills teacher plan.",
};

const paidPlans = new Set(["starter", "professional", "business"]);
const intervals = new Set(["monthly", "annual"]);

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; interval?: string }>;
}) {
  const params = await searchParams;
  const plan = params.plan ?? "";
  const interval = params.interval === "annual" ? "annual" : "monthly";

  if (!paidPlans.has(plan) || !intervals.has(interval)) {
    redirect("/#pricing");
  }

  const user = await getCurrentUser();
  if (!user) {
    const redirectTo = `/subscribe?plan=${plan}&interval=${interval}`;
    redirect(
      `/register?role=teacher&plan=${plan}&billing=${interval}&redirect=${encodeURIComponent(redirectTo)}`,
    );
  }

  if (!hasTeacherMembership(user)) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Teacher plans only</h1>
          <p className="text-muted-foreground">
            Subscriptions are for teachers. Students can browse tutors and book lessons for free.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button render={<Link href="/teachers" />}>Find a tutor</Button>
          <Button variant="outline" render={<Link href="/dashboard" />}>
            Student dashboard
          </Button>
        </div>
      </div>
    );
  }

  redirect(`/dashboard/teacher/billing?plan=${plan}&interval=${interval}`);
}
