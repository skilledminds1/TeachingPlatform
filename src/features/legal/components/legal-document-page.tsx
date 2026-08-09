import Link from "next/link";

import { env } from "@/lib/env";

export type LegalSection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

export function LegalDocumentPage({
  title,
  // Defaults track CURRENT_LEGAL_DOCUMENTS in src/lib/legal/documents.ts. Bump both together:
  // this only paints the header, while the id over there is what decides whether a user is
  // sent back to /legal-review to re-accept.
  version = "5.0",
  effectiveDate = "9 August 2026",
  introduction,
  sections,
}: {
  title: string;
  version?: string;
  effectiveDate?: string;
  introduction: string;
  sections: LegalSection[];
}) {
  const hasPlaceholder =
    env.LEGAL_ENTITY_NAME.includes("REPLACE BEFORE LAUNCH") ||
    env.LEGAL_REGISTRATION_NUMBER.includes("REPLACE BEFORE LAUNCH") ||
    env.LEGAL_BUSINESS_ADDRESS.includes("REPLACE BEFORE LAUNCH");

  return (
    <main id="main-content" className="mx-auto max-w-4xl px-6 py-12 md:py-16">
      <article className="space-y-10">
        <header className="space-y-4 border-b border-border pb-8">
          <Link href="/" className="text-sm font-medium text-primary hover:underline">
            Amazing Skills
          </Link>
          <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Version {version} · Effective {effectiveDate}
          </p>
          <p className="max-w-3xl leading-relaxed text-muted-foreground">{introduction}</p>
          {hasPlaceholder ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
              Pre-launch notice: the operator identity below contains configuration placeholders
              and must be completed and legally reviewed before public launch.
            </p>
          ) : null}
        </header>

        {sections.map((section) => (
          <section key={section.title} className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight">{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="leading-relaxed text-muted-foreground">
                {paragraph}
              </p>
            ))}
            {section.bullets ? (
              <ul className="list-disc space-y-2 ps-6 text-muted-foreground">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}

        <section className="space-y-3 rounded-xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold">Operator and contact details</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <LegalDetail label="Legal entity" value={env.LEGAL_ENTITY_NAME} />
            <LegalDetail label="Legal status / registration" value={env.LEGAL_REGISTRATION_NUMBER} />
            <LegalDetail label="Business address" value={env.LEGAL_BUSINESS_ADDRESS} />
            <LegalDetail label="Support" value={env.LEGAL_SUPPORT_EMAIL} />
            <LegalDetail
              label="Information Officer / privacy"
              value={env.LEGAL_INFORMATION_OFFICER_EMAIL}
            />
          </dl>
        </section>

        <p className="text-xs leading-relaxed text-muted-foreground">
          This document is an operational draft and must be reviewed by qualified South African
          counsel before launch. Nothing in it excludes rights or duties that cannot legally be
          waived.
        </p>
      </article>
    </main>
  );
}

function LegalDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
