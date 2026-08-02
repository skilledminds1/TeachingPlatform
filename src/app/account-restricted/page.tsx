import { ShieldX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { signOut } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { AppealForm } from "@/features/trust/components/trust-forms";
import { formatDateTime, formatStatus } from "@/lib/format";
import { db } from "@/lib/db";
import { requireAuthenticatedIdentity } from "@/server/auth/session";

export const metadata: Metadata = { title: "Account restricted" };

export default async function AccountRestrictedPage() {
  const user = await requireAuthenticatedIdentity();
  const sanctions = await db.sanction.findMany({
    where: { userId: user.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
    include: { appeals: { where: { appellantId: user.id }, take: 1 } },
  });
  return (
    <main id="main-content" className="min-h-screen bg-muted/30 px-6 py-12">
      <div className="mx-auto max-w-2xl space-y-6 rounded-2xl border bg-card p-6 shadow-sm md:p-8">
        <header className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <ShieldX className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold">Account access restricted</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Status: {formatStatus(user.deletedAt ? "removed" : user.accountStatus)}
            </p>
          </div>
        </header>
        {user.accountStatusReason ? (
          <section className="rounded-xl bg-muted/60 p-4 text-sm">
            <p className="font-medium">Reason</p>
            <p className="mt-1">{user.accountStatusReason}</p>
            {user.accountRestrictedUntil ? (
              <p className="mt-2 text-muted-foreground">
                Scheduled end: {formatDateTime(user.accountRestrictedUntil, user.timezone)}
              </p>
            ) : null}
          </section>
        ) : null}
        {sanctions.map((sanction) => (
          <section key={sanction.id} className="rounded-xl border p-4">
            <p className="font-semibold">{formatStatus(sanction.type)}</p>
            <p className="mt-1 text-sm">{sanction.reason}</p>
            {sanction.appeals[0] ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Appeal status: {formatStatus(sanction.appeals[0].status)}
                {sanction.appeals[0].decision ? ` · ${sanction.appeals[0].decision}` : ""}
              </p>
            ) : (
              <div className="mt-4"><AppealForm sanctionId={sanction.id} /></div>
            )}
          </section>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button render={<Link href="/legal-review" />} variant="outline">Review legal documents</Button>
          <Button render={<Link href="/dashboard/privacy" />} variant="outline">Privacy rights</Button>
          <form action={signOut}><Button type="submit" variant="ghost">Sign out</Button></form>
        </div>
      </div>
    </main>
  );
}
