import type { Metadata } from "next";
import { LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { AdminNav } from "@/features/admin/components/admin-nav";
import { NotificationBellLoader } from "@/features/notifications/components/notification-bell-loader";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { requirePlatformAdmin } from "@/server/auth/session";

export const metadata: Metadata = {
  title: "Platform Admin",
  description: "Amazing Skills administration and marketplace moderation.",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let admin;

  try {
    admin = await requirePlatformAdmin();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login?redirect=/admin");
    }
    if (error instanceof ForbiddenError) {
      redirect("/dashboard");
    }
    // Unexpected failures (DB, sync, etc.) should surface as errors — not look like logout.
    throw error;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-lg">
        <div className="flex h-16 items-center justify-between px-4 md:px-6">
          <Link href="/admin" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="size-4" aria-hidden />
            </span>
            <span className="hidden sm:inline">Amazing Skills</span>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              Admin
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{admin.name}</p>
              <p className="text-xs text-muted-foreground">{admin.email}</p>
            </div>
            <NotificationBellLoader />
            <form action={signOut}>
              <Button type="submit" variant="ghost" aria-label="Sign out">
                <LogOut className="size-4" aria-hidden />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[240px_1fr]">
        <aside className="border-b border-border bg-background lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:border-r lg:border-b-0">
          <AdminNav />
        </aside>
        <main id="main-content" className="min-w-0 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
