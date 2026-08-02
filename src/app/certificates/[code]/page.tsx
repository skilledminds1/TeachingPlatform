import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CertificatePrintButton } from "@/features/courses/components/certificate-print-button";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Course certificate",
  description: "Verify an Amazing Skills course completion certificate.",
};

export default async function CertificatePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const certificate = await db.courseCertificate.findUnique({
    where: { verificationCode: code },
    select: {
      studentName: true,
      courseTitle: true,
      teacherName: true,
      issuedAt: true,
      verificationCode: true,
      revokedAt: true,
      revocationReason: true,
    },
  });
  if (!certificate) notFound();

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-background print:hidden">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <Link href="/" className="font-semibold tracking-tight">
            Amazing Skills
          </Link>
          <CertificatePrintButton />
        </div>
      </header>

      <main id="main-content" className="mx-auto max-w-4xl px-6 py-10">
        {/*
          MON-35: this page is the credential's public proof, so a revoked certificate must
          say so plainly and before anything else. It previously rendered whatever it found
          as valid, which kept vouching for students whose purchase had been refunded.
        */}
        {certificate.revokedAt ? (
          <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 p-5">
            <p className="font-semibold text-destructive">This certificate is no longer valid</p>
            <p className="mt-1 text-sm text-destructive/90">
              It was revoked on {formatDate(certificate.revokedAt)}
              {certificate.revocationReason ? ` — ${certificate.revocationReason}.` : "."}
            </p>
          </div>
        ) : null}

        <div
          className={`overflow-hidden rounded-2xl border border-border bg-card shadow-sm ${
            certificate.revokedAt ? "opacity-60 grayscale" : ""
          }`}
        >
          <div className="border-b border-border bg-gradient-to-br from-primary/15 via-transparent to-transparent px-8 py-10 text-center">
            <p className="text-xs font-medium tracking-[0.2em] text-primary uppercase">
              Certificate of completion
            </p>
            <h1 className="mt-4 font-heading text-3xl font-semibold tracking-tight md:text-4xl">
              {certificate.studentName}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">has successfully completed</p>
            <p className="mt-2 text-xl font-semibold">{certificate.courseTitle}</p>
          </div>
          <div className="grid gap-6 px-8 py-8 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Instructor</p>
              <p className="mt-1 text-sm font-medium">{certificate.teacherName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Issued</p>
              <p className="mt-1 text-sm font-medium">{formatDate(certificate.issuedAt)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Credential ID</p>
              <p className="mt-1 break-all font-mono text-xs font-medium">
                {certificate.verificationCode}
              </p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground print:hidden">
          This page is a public verification of the certificate. Use your browser&apos;s print
          dialog to save a PDF copy.
        </p>
      </main>
    </div>
  );
}
