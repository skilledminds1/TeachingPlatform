import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { requireAuth } from "@/server/auth/session";

export default async function TeacherDashboardPage() {
  const user = await requireAuth();

  const isTeacher = user.memberships.some(
    (m) => m.role === "admin" || m.role === "instructor",
  );

  if (!isTeacher && !user.isPlatformAdmin) {
    redirect("/dashboard");
  }

  const org = user.memberships[0]?.organization;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Teacher dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {user.name}
          {org ? ` · ${org.name}` : null}
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Your Free plan organization is ready. Profile setup, availability, and PayFast billing
          come next.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button render={<Link href="/" />}>Back to home</Button>
          <form action={signOut}>
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
