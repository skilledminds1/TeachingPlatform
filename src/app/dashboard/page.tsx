import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { getCurrentUser, getPostAuthRedirect } from "@/server/auth/session";

export default async function DashboardIndexPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?redirect=/dashboard");
  }

  const preferred = getPostAuthRedirect(user);
  if (preferred !== "/dashboard") {
    redirect(preferred);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Student dashboard</h1>
        <p className="text-muted-foreground">
          Signed in as {user.name} ({user.email})
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Marketplace booking and session tools land in the next phases. For now you can browse
          tutors and manage your account.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button render={<Link href="/teachers" />}>Browse tutors</Button>
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
