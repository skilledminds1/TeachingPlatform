import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LegalAcceptanceForm } from "@/features/legal/components/legal-acceptance-form";
import { currentLegalDocumentsForRole } from "@/lib/legal/documents";
import { getPostAuthRedirect, requireAuthenticatedIdentity } from "@/server/auth/session";
import {
  getMissingCurrentLegalDocuments,
  legalRoleFromMemberships,
} from "@/server/legal/acceptance";

export const metadata: Metadata = { title: "Review agreements" };

function safeRedirectPath(path: string | undefined): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path === "/legal-review") {
    return null;
  }
  return path;
}

export default async function LegalReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [user, query] = await Promise.all([requireAuthenticatedIdentity(), searchParams]);
  const role = legalRoleFromMemberships(user.memberships);
  const missing = await getMissingCurrentLegalDocuments(user.id, role);
  if (missing.length === 0) {
    redirect(safeRedirectPath(query.next) ?? (await getPostAuthRedirect(user)));
  }
  const documents = currentLegalDocumentsForRole(role);

  return (
    <main className="min-h-screen bg-muted/30 px-6 py-12">
      <div className="mx-auto max-w-2xl space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
        <div className="flex items-start gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="size-5" aria-hidden />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Review required agreements</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Read and accept the current agreements before using your{" "}
              {role === "teacher" ? "teacher" : "student"} account.
            </p>
          </div>
        </div>

        <section className="rounded-xl bg-muted/50 p-4 text-sm">
          <p className="font-medium">Documents being recorded</p>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {documents.map((document) => (
              <li key={document.id}>
                {document.title} · version {document.version}
              </li>
            ))}
          </ul>
        </section>

        <LegalAcceptanceForm role={role} next={safeRedirectPath(query.next) ?? undefined} />

        <p className="text-xs text-muted-foreground">
          We store the document versions and acceptance time as evidence of your agreement.
          Optional marketing and product-improvement choices are handled separately.
        </p>
      </div>
    </main>
  );
}
