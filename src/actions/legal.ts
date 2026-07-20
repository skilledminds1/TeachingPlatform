"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { db } from "@/lib/db";
import { legalAcceptanceInputSchema } from "@/lib/validations/auth";
import { getPostAuthRedirect, requireAuthenticatedIdentity } from "@/server/auth/session";
import {
  legalRoleFromMemberships,
  recordCurrentLegalAcceptances,
} from "@/server/legal/acceptance";
import { fail, ok, type ActionResult } from "@/types/action";

const acceptLegalSchema = legalAcceptanceInputSchema.extend({
  next: z.string().optional(),
});

function safeRedirectPath(path: string | null | undefined): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path === "/legal-review") {
    return null;
  }
  return path;
}

export async function acceptCurrentLegalDocuments(
  input: unknown,
): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = acceptLegalSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Accept every required agreement.", "VALIDATION_ERROR");
  }

  const user = await requireAuthenticatedIdentity();
  const role = legalRoleFromMemberships(user.memberships);
  if (role === "teacher" && !parsed.data.acceptedTeacherAgreement) {
    return fail("Teachers must accept the Teacher Agreement.", "VALIDATION_ERROR");
  }

  const priorAcceptanceCount = await db.legalAcceptance.count({ where: { userId: user.id } });
  const requestHeaders = await headers();
  await recordCurrentLegalAcceptances({
    userId: user.id,
    role,
    method: priorAcceptanceCount > 0 ? "reacceptance" : "oauth_review",
    confirmedAdult: parsed.data.confirmedAdult,
    evidence: {
      ip: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: requestHeaders.get("user-agent"),
    },
  });

  const intended = safeRedirectPath(parsed.data.next);
  return ok({ redirectTo: intended ?? (await getPostAuthRedirect(user)) });
}
