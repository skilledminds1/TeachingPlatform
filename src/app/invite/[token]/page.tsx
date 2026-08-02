import type { Metadata } from "next";
import Link from "next/link";

import { AcceptInviteCard } from "@/features/organizations/components/accept-invite-card";

export const metadata: Metadata = {
  title: "Organization invitation",
  description: "Accept your Amazing Skills organization invitation.",
};

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-6">
          <Link href="/" className="font-semibold tracking-tight">
            Amazing Skills
          </Link>
        </div>
      </header>
      <main id="main-content" className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
          <AcceptInviteCard token={token} />
        </div>
      </main>
    </div>
  );
}
