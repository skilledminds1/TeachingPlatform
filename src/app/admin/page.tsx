import Link from "next/link";

import { signOut } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { requirePlatformAdmin } from "@/server/auth/session";

export default async function AdminDashboardPage() {
  const user = await requirePlatformAdmin();

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Platform overview</h1>
        <p className="text-muted-foreground">Signed in as {user.email}</p>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Teacher approval queues, review moderation, and analytics will live here in Phase 2+.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" render={<Link href="/" />}>
            Home
          </Button>
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
