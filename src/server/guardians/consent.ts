import { createHash } from "node:crypto";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { CURRENT_LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import { logger } from "@/lib/observability/logger";
import { createLinkToken, hashLinkToken } from "@/lib/security/tokens";
import { enqueueEmail } from "@/server/notifications/email-outbox";
import { renderEmailTemplate } from "@/services/email/templates";

/**
 * Guardian consent for a student under 18.
 *
 * The mechanism is double opt-in: the guardian's address is stated by the student at
 * registration, a single-use token is emailed to it, and consent exists only once someone
 * holding that mailbox confirms on a page that says what they are agreeing to.
 *
 * BE PRECISE ABOUT WHAT THAT PROVES, because the privacy policy now claims exactly this and
 * no more. It proves that a person controlling the named mailbox agreed. It does not prove
 * they are the child's guardian, and it is not identity verification — nothing here checks a
 * document. That is the accepted standard short of document checks, and stating it plainly is
 * better than implying a level of assurance the code does not deliver.
 */

/** A consent request is dead after this. Long enough for a parent to see the email. */
const CONSENT_LINK_TTL_DAYS = 14;

function hashEvidence(value: string | null | undefined): string | null {
  if (!value) return null;
  return createHash("sha256")
    .update(`${env.LEGAL_EVIDENCE_SALT ?? "local-development"}:${value}`)
    .digest("hex");
}

export type GuardianDetails = {
  guardianName: string;
  guardianEmail: string;
  relationship: string;
};

export type ConsentEvidence = { ip?: string | null; userAgent?: string | null };

/**
 * Create or replace a pending consent request and email the guardian.
 *
 * Re-requesting mints a NEW token and invalidates the old one, because the common reason to
 * re-request is that the address was wrong — and a link already sent to the wrong mailbox must
 * stop working the moment it is corrected.
 *
 * Verified consent is never silently replaced. Changing the guardian on an account that
 * already has consent revokes it first, so a minor cannot be quietly re-parented to an address
 * that has agreed to nothing.
 */
export async function requestGuardianConsent(input: {
  minorUserId: string;
  minorName: string;
  guardian: GuardianDetails;
  evidence?: ConsentEvidence;
}): Promise<{ requested: boolean }> {
  const token = createLinkToken();
  const tokenHash = hashLinkToken(token);
  const expiresAt = new Date(Date.now() + CONSENT_LINK_TTL_DAYS * 86_400_000);
  const guardianEmail = input.guardian.guardianEmail.trim().toLowerCase();

  const existing = await db.guardianConsent.findUnique({
    where: { minorUserId: input.minorUserId },
    select: { status: true, guardianEmail: true },
  });
  if (existing?.status === "verified" && existing.guardianEmail === guardianEmail) {
    // Already consented, by this guardian. Re-sending would be noise.
    return { requested: false };
  }

  await db.guardianConsent.upsert({
    where: { minorUserId: input.minorUserId },
    update: {
      guardianName: input.guardian.guardianName,
      guardianEmail,
      relationship: input.guardian.relationship,
      status: "pending",
      tokenHash,
      expiresAt,
      requestedAt: new Date(),
      verifiedAt: null,
      revokedAt: null,
      revokedReason: null,
      policyVersion: CURRENT_LEGAL_DOCUMENTS.privacy.version,
    },
    create: {
      minorUserId: input.minorUserId,
      guardianName: input.guardian.guardianName,
      guardianEmail,
      relationship: input.guardian.relationship,
      tokenHash,
      expiresAt,
      ipHash: hashEvidence(input.evidence?.ip),
      userAgentHash: hashEvidence(input.evidence?.userAgent),
      policyVersion: CURRENT_LEGAL_DOCUMENTS.privacy.version,
    },
  });

  const url = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/guardian-consent/${token}`;
  await enqueueEmail({
    // No userId: the guardian is not an account holder, so there are no notification
    // preferences to consult and this is not a message they can opt out of — it is the
    // request for permission itself.
    recipient: guardianEmail,
    subject: `${input.minorName} needs your permission to book lessons`,
    category: "legal",
    idempotencyKey: `guardian-consent:${tokenHash}`,
    html: renderEmailTemplate({
      heading: "Permission needed for a young learner",
      paragraphs: [
        `${input.minorName} has created a student account on Amazing Skills and named you as their parent or guardian.`,
        "Amazing Skills is a tutoring marketplace. Students book live one-to-one video lessons with independent teachers, and pay those teachers directly — the platform never handles that money.",
        "Until you confirm, this account cannot book a lesson.",
        "Keep this email. The same link lets you withdraw permission at any time, which stops any further bookings. You can also just reply to this message.",
        `This link works once and expires in ${CONSENT_LINK_TTL_DAYS} days. If you were not expecting it, ignore it and no lessons can be booked.`,
      ],
      action: { label: "Review and give permission", href: url },
    }),
  });

  logger.info("guardian_consent_requested", { minorUserId: input.minorUserId });
  return { requested: true };
}

export type ConsentLookup =
  | { ok: true; minorName: string; guardianName: string; relationship: string }
  /**
   * Already granted. NOT an error state: the same link is how a guardian comes back to
   * withdraw, which is the mechanism behind the promise made in the consent email, the Terms
   * and the Privacy Policy. `verifyGuardianConsent` deliberately leaves `tokenHash` in place
   * after granting so this stays reachable.
   */
  | { ok: false; reason: "already_verified"; minorName: string; verifiedAt: Date | null }
  | { ok: false; reason: "not_found" | "expired" | "revoked" };

/** Resolve a token for the confirmation page, without granting anything. */
export async function lookupGuardianConsent(token: string): Promise<ConsentLookup> {
  const consent = await db.guardianConsent.findUnique({
    where: { tokenHash: hashLinkToken(token) },
    select: {
      status: true,
      expiresAt: true,
      verifiedAt: true,
      guardianName: true,
      relationship: true,
      minor: { select: { name: true } },
    },
  });
  if (!consent) return { ok: false, reason: "not_found" };
  if (consent.status === "revoked") return { ok: false, reason: "revoked" };
  if (consent.status === "verified") {
    return {
      ok: false,
      reason: "already_verified",
      minorName: consent.minor.name,
      verifiedAt: consent.verifiedAt,
    };
  }
  if (consent.expiresAt <= new Date()) return { ok: false, reason: "expired" };

  return {
    ok: true,
    minorName: consent.minor.name,
    guardianName: consent.guardianName,
    relationship: consent.relationship,
  };
}

/**
 * Grant consent.
 *
 * The update is conditional on the row still being pending and unexpired, so a link opened
 * twice — or opened after the student re-requested against a corrected address — grants once
 * and does not resurrect a superseded request.
 *
 * A ConsentRecord row is written alongside. That model was declared and never written by
 * anything, while the privacy policy told users their consent was recorded; this is the first
 * thing that makes that true, and it is what a POPIA subject-access request is answered from.
 */
export async function verifyGuardianConsent(input: {
  token: string;
  evidence?: ConsentEvidence;
}): Promise<{ granted: boolean; minorUserId?: string }> {
  const tokenHash = hashLinkToken(input.token);
  const now = new Date();

  return db.$transaction(async (tx) => {
    const consent = await tx.guardianConsent.findUnique({
      where: { tokenHash },
      select: { id: true, minorUserId: true, status: true, expiresAt: true, policyVersion: true },
    });
    if (!consent || consent.status !== "pending" || consent.expiresAt <= now) {
      return { granted: false };
    }

    const updated = await tx.guardianConsent.updateMany({
      where: { id: consent.id, status: "pending", expiresAt: { gt: now } },
      data: {
        status: "verified",
        verifiedAt: now,
        ipHash: hashEvidence(input.evidence?.ip),
        userAgentHash: hashEvidence(input.evidence?.userAgent),
      },
    });
    if (updated.count === 0) return { granted: false };

    await tx.consentRecord.create({
      data: {
        userId: consent.minorUserId,
        purpose: "guardian_consent",
        granted: true,
        policyVersion: consent.policyVersion,
        source: "guardian_email_confirmation",
      },
    });

    return { granted: true, minorUserId: consent.minorUserId };
  });
}

/**
 * Withdraw consent.
 *
 * Withdrawal blocks NEW bookings and leaves lessons already confirmed alone. Cancelling a
 * booked lesson from here would take a decision that belongs to the guardian, the student and
 * the teacher — and would do it silently, from an email link. The guardian is told exactly
 * that, and the trust queue is where a request to unwind an existing booking goes.
 */
export async function revokeGuardianConsent(input: {
  minorUserId: string;
  reason: string;
}): Promise<{ revoked: boolean }> {
  const now = new Date();
  const result = await db.$transaction(async (tx) => {
    const revoked = await tx.guardianConsent.updateMany({
      where: { minorUserId: input.minorUserId, status: { in: ["pending", "verified"] } },
      data: { status: "revoked", revokedAt: now, revokedReason: input.reason },
    });
    if (revoked.count === 0) return false;

    const consent = await tx.guardianConsent.findUnique({
      where: { minorUserId: input.minorUserId },
      select: { policyVersion: true },
    });
    await tx.consentRecord.updateMany({
      where: { userId: input.minorUserId, purpose: "guardian_consent", withdrawnAt: null },
      data: { withdrawnAt: now },
    });
    await tx.consentRecord.create({
      data: {
        userId: input.minorUserId,
        purpose: "guardian_consent",
        granted: false,
        policyVersion: consent?.policyVersion ?? CURRENT_LEGAL_DOCUMENTS.privacy.version,
        source: "guardian_withdrawal",
      },
    });
    return true;
  });

  if (result) logger.info("guardian_consent_revoked", { minorUserId: input.minorUserId });
  return { revoked: result };
}

/**
 * Withdraw using the link from the original email.
 *
 * The guardian has no account and never will, so the token is the credential — the same one
 * that granted permission. That is deliberate: withdrawal only ever STOPS bookings, so the
 * failure mode of a leaked link is a lesson that does not happen, which is the safe direction.
 * Granting is the operation that needed protecting, and it already has the same protection.
 */
export async function withdrawGuardianConsentByToken(input: {
  token: string;
  reason: string;
}): Promise<{ withdrawn: boolean }> {
  const consent = await db.guardianConsent.findUnique({
    where: { tokenHash: hashLinkToken(input.token) },
    select: { minorUserId: true, status: true },
  });
  if (!consent || consent.status === "revoked") return { withdrawn: false };

  const result = await revokeGuardianConsent({
    minorUserId: consent.minorUserId,
    reason: input.reason,
  });
  return { withdrawn: result.revoked };
}

export type BookingEligibility =
  | { allowed: true }
  | { allowed: false; reason: "age_unknown" | "consent_missing" | "consent_pending" | "consent_revoked" };

/**
 * May this student book a lesson?
 *
 * Adults always may. A minor may only with verified consent. An account with no stated date of
 * birth may NOT — "not stated" is not "adult", and the whole reason this exists is that the
 * platform previously assumed otherwise on the strength of an unchecked checkbox.
 */
export async function guardianBookingEligibility(input: {
  isMinor: boolean | null;
  minorUserId: string;
}): Promise<BookingEligibility> {
  if (input.isMinor === false) return { allowed: true };
  if (input.isMinor === null) return { allowed: false, reason: "age_unknown" };

  const consent = await db.guardianConsent.findUnique({
    where: { minorUserId: input.minorUserId },
    select: { status: true },
  });
  if (!consent) return { allowed: false, reason: "consent_missing" };
  if (consent.status === "verified") return { allowed: true };
  if (consent.status === "revoked") return { allowed: false, reason: "consent_revoked" };
  return { allowed: false, reason: "consent_pending" };
}

/** One place for the message, so the wording cannot drift between the gates that use it. */
export function bookingEligibilityMessage(reason: Exclude<BookingEligibility, { allowed: true }>["reason"]): string {
  switch (reason) {
    case "age_unknown":
      return "Add your date of birth in settings before booking a lesson.";
    case "consent_missing":
      return "A parent or guardian needs to give permission before you can book a lesson.";
    case "consent_pending":
      return "We have emailed your parent or guardian for permission. You can book once they confirm.";
    case "consent_revoked":
      return "Your parent or guardian has withdrawn permission for new bookings. Contact support if you think this is wrong.";
  }
}
