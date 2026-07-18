import { redirect } from "next/navigation";

import { ForbiddenError } from "@/lib/errors";
import { requirePlatformAdmin } from "@/server/auth/session";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requirePlatformAdmin();
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect("/dashboard");
    }
    redirect("/login?redirect=/admin");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-6">
          <p className="text-sm font-medium">Platform Admin</p>
        </div>
      </header>
      {children}
    </div>
  );
}
