import { createHash } from "node:crypto";

import type { LegalAcceptanceMethod, OrgRole } from "@prisma/client";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import {
  currentLegalDocumentsForRole,
  type CurrentLegalDocument,
} from "@/lib/legal/documents";
import type { RegisterRole } from "@/lib/validations/auth";

export type LegalRequestEvidence = {
  ip?: string | null;
  userAgent?: string | null;
};

function hashEvidence(value: string | null | undefined): string | null {
  if (!value) return null;
  return createHash("sha256")
    .update(`${env.LEGAL_EVIDENCE_SALT ?? "local-development"}:${value}`)
    .digest("hex");
}

export function legalRoleFromMemberships(
  memberships: Array<{ role: OrgRole }>,
): RegisterRole {
  return memberships.some(
    (membership) => membership.role === "admin" || membership.role === "instructor",
  )
    ? "teacher"
    : "student";
}

export async function getMissingCurrentLegalDocuments(
  userId: string,
  role: RegisterRole,
): Promise<CurrentLegalDocument[]> {
  const required = currentLegalDocumentsForRole(role);
  const accepted = await db.legalAcceptance.findMany({
    where: {
      userId,
      documentId: { in: required.map((document) => document.id) },
    },
    select: { documentId: true },
  });
  const acceptedIds = new Set(accepted.map((item) => item.documentId));
  return required.filter((document) => !acceptedIds.has(document.id));
}

export async function hasCurrentLegalAcceptances(
  userId: string,
  role: RegisterRole,
): Promise<boolean> {
  return (await getMissingCurrentLegalDocuments(userId, role)).length === 0;
}

export async function recordCurrentLegalAcceptances(input: {
  userId: string;
  role: RegisterRole;
  method: LegalAcceptanceMethod;
  confirmedAdult: boolean;
  evidence?: LegalRequestEvidence;
}): Promise<void> {
  if (!input.confirmedAdult) {
    throw new Error("You must confirm that you are at least 18 years old.");
  }

  const documents = currentLegalDocumentsForRole(input.role);
  const existingCount = await db.legalDocument.count({
    where: { id: { in: documents.map((document) => document.id) } },
  });
  if (existingCount !== documents.length) {
    throw new Error("Legal document versions are not initialized.");
  }

  await db.legalAcceptance.createMany({
    data: documents.map((document) => ({
      userId: input.userId,
      documentId: document.id,
      acceptedRole: input.role,
      method: input.method,
      confirmedAdult: input.confirmedAdult,
      ipHash: hashEvidence(input.evidence?.ip),
      userAgentHash: hashEvidence(input.evidence?.userAgent),
    })),
    skipDuplicates: true,
  });
}

export async function getLegalAcceptanceHistory(userId: string) {
  return db.legalAcceptance.findMany({
    where: { userId },
    orderBy: { acceptedAt: "desc" },
    include: {
      document: {
        select: {
          type: true,
          title: true,
          version: true,
          path: true,
          effectiveAt: true,
        },
      },
    },
  });
}
