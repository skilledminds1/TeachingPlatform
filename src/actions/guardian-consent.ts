"use server";

import { headers } from "next/headers";
import { z } from "zod";

import {
  clientIdentityFromHeaders,
  enforceActionRateLimit,
} from "@/server/security/action-rate-limit";
import { requireAuth } from "@/server/auth/session";
import { isMinor } from "@/lib/age";
import { db } from "@/lib/db";
import {
  requestGuardianConsent,
  verifyGuardianConsent,
  withdrawGuardianConsentByToken,
} from "@/server/guardians/consent";
import { guardianSchema } from "@/lib/validations/auth";
import { fail, ok, type ActionResult } from "@/types/action";

const tokenSchema = z.string().trim().min(20).max(200);

/**
 * The guardian confirms. Unauthenticated by design — a guardian has no account, and the
 * single-use token is the credential.
 *
 * Rate limited on the token rather than a user id, since there is no user here. A token is
 * 256 bits of CSPRNG output, so this is not really guessable; the limit is there so a leaked
 * link cannot be replayed in a loop against the transaction.
 */
export async function confirmGuardianConsent(
  token: unknown,
): Promise<ActionResult<{ granted: true }>> {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return fail("This permission link is not valid.", "VALIDATION_ERROR");

  const limited = await enforceActionRateLimit({
    action: "guardian-consent-confirm",
    limit: 10,
    windowMs: 10 * 60_000,
    identifier: parsed.data.slice(0, 32),
  });
  if (limited) return limited;

  const requestHeaders = await headers();
  const result = await verifyGuardianConsent({
    token: parsed.data,
    evidence: {
      ip: clientIdentityFromHeaders(requestHeaders),
      userAgent: requestHeaders.get("user-agent"),
    },
  });
  if (!result.granted) {
    return fail(
      "This permission link has already been used, expired, or been replaced.",
      "CONFLICT",
    );
  }
  return ok({ granted: true });
}

/**
 * The guardian withdraws permission.
 *
 * Unauthenticated, like granting: the token from their email is the credential, because a
 * guardian has no account. Without this the withdrawal promised in the consent email, the
 * Terms and the Privacy Policy had no mechanism at all — `revokeGuardianConsent` existed and
 * nothing called it, so honouring a request meant editing the database by hand.
 *
 * Withdrawal stops NEW bookings and leaves confirmed lessons alone. Cancelling a booked lesson
 * is a decision for the guardian, the student and the teacher together, and doing it silently
 * from an email link is not that conversation.
 */
export async function withdrawGuardianConsent(
  token: unknown,
): Promise<ActionResult<{ withdrawn: true }>> {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return fail("This permission link is not valid.", "VALIDATION_ERROR");

  const limited = await enforceActionRateLimit({
    action: "guardian-consent-withdraw",
    limit: 10,
    windowMs: 10 * 60_000,
    identifier: parsed.data.slice(0, 32),
  });
  if (limited) return limited;

  const result = await withdrawGuardianConsentByToken({
    token: parsed.data,
    reason: "Withdrawn by the parent or guardian",
  });
  if (!result.withdrawn) {
    return fail("This permission has already been withdrawn, or the link is not valid.", "CONFLICT");
  }
  return ok({ withdrawn: true });
}

/**
 * The student asks again — because the address was wrong, or the email never arrived.
 *
 * Minting a new token invalidates the old one, which is the point when the reason for
 * resending is that the first link went to the wrong mailbox.
 */
export async function resendGuardianConsent(
  input: unknown,
): Promise<ActionResult<{ sent: true }>> {
  const user = await requireAuth();
  const parsed = guardianSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the details.", "VALIDATION_ERROR");
  }

  const limited = await enforceActionRateLimit({
    action: "guardian-consent-resend",
    limit: 5,
    windowMs: 60 * 60_000,
    userId: user.id,
  });
  if (limited) return limited;

  const account = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { name: true, dateOfBirth: true },
  });
  if (isMinor(account.dateOfBirth) !== true) {
    return fail("This account does not need guardian permission.", "CONFLICT");
  }

  const requestHeaders = await headers();
  await requestGuardianConsent({
    minorUserId: user.id,
    minorName: account.name,
    guardian: parsed.data,
    evidence: {
      ip: clientIdentityFromHeaders(requestHeaders),
      userAgent: requestHeaders.get("user-agent"),
    },
  });
  return ok({ sent: true });
}
