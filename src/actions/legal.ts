"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { db } from "@/lib/db";
import { safeRedirectPath } from "@/lib/security/redirect";
import { clientIdentityFromHeaders } from "@/server/security/action-rate-limit";
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

/**
 * Same-origin check, plus a guard against bouncing the user back to the legal-review
 * interstitial they were just sent away from.
 */
function safeLegalRedirectPath(path: string | null | undefined): string | null {
  const resolved = safeRedirectPath(path);
  if (!resolved || resolved === "/legal-review" || resolved.startsWith("/legal-review?")) {
    return null;
  }
  return resolved;
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
      ip: clientIdentityFromHeaders(requestHeaders),
      userAgent: requestHeaders.get("user-agent"),
    },
  });

  const intended = safeLegalRedirectPath(parsed.data.next);
  return ok({ redirectTo: intended ?? (await getPostAuthRedirect(user)) });
}
