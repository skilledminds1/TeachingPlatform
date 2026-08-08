import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/observability/logger";
import {
  normalizePaymentLinkUrl,
  paymentLinkRejectionMessage,
  type NormalizedPaymentLink,
} from "@/lib/payments/payment-links";
import { createLinkToken, hashLinkToken } from "@/lib/security/tokens";
import { enqueueEmail } from "@/server/notifications/email-outbox";
import { renderEmailTemplate } from "@/services/email/templates";

/**
 * Saving and changing a teacher's payment link.
 *
 * The asymmetry here is deliberate: setting the FIRST link is immediate, replacing a live one
 * requires email confirmation. There is nothing to steal before a link exists, and making a
 * teacher confirm their very first one is friction on the step that already has the highest
 * drop-off. Once money is flowing to a destination, changing it is the account-takeover
 * payload — so from then on the attacker needs the mailbox too, not just the session.
 */

/** A staged change dies after this, so an abandoned one cannot be confirmed months later. */
const CHANGE_CONFIRM_TTL_HOURS = 48;

export type SaveLinkResult =
  | { status: "saved"; link: NormalizedPaymentLink }
  | { status: "confirmation_sent"; link: NormalizedPaymentLink }
  | { status: "unchanged" }
  | { status: "rejected"; message: string };

export async function saveTeacherPaymentLink(input: {
  userId: string;
  email: string;
  url: string;
}): Promise<SaveLinkResult> {
  const normalized = normalizePaymentLinkUrl(input.url);
  if (!normalized.ok) {
    return { status: "rejected", message: paymentLinkRejectionMessage(normalized.reason) };
  }
  const link = normalized.link;

  const profile = await db.teacherProfile.findUnique({
    where: { userId: input.userId },
    select: { id: true, paymentLinkUrl: true },
  });
  if (!profile) return { status: "rejected", message: "Complete your teacher profile first." };

  if (profile.paymentLinkUrl === link.url) return { status: "unchanged" };

  // First link: nothing to protect, so it goes live immediately.
  if (!profile.paymentLinkUrl) {
    await db.teacherProfile.update({
      where: { id: profile.id },
      data: {
        paymentLinkUrl: link.url,
        paymentLinkHost: link.host,
        paymentLinkProviderId: link.providerId,
        paymentLinkSetAt: new Date(),
      },
    });
    await notifyLinkActivity({
      email: input.email,
      subject: "Your payment link is live",
      heading: "Students can now pay you",
      paragraphs: [
        `Payments for your lessons will go to your ${link.providerName} link at ${link.host}.`,
        "If this was not you, change your password immediately and contact support — this is where your students' money goes.",
      ],
      idempotencyKey: `payment-link-set:${profile.id}:${link.url}`,
    });
    return { status: "saved", link };
  }

  // Changing a live link. Stage it and require the mailbox.
  const token = createLinkToken();
  await db.teacherProfile.update({
    where: { id: profile.id },
    data: {
      pendingPaymentLinkUrl: link.url,
      pendingPaymentLinkHost: link.host,
      pendingPaymentLinkProviderId: link.providerId,
      pendingPaymentLinkTokenHash: hashLinkToken(token),
      pendingPaymentLinkRequestedAt: new Date(),
    },
  });

  const confirmUrl = `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/dashboard/teacher/payments/confirm/${token}`;
  await notifyLinkActivity({
    email: input.email,
    subject: "Confirm the change to your payment link",
    heading: "Someone asked to change where your students pay you",
    paragraphs: [
      `The request points payments at ${link.host}. Your current link keeps working until you confirm.`,
      "If you did not ask for this, DO NOT confirm. Change your password immediately and contact support — someone with access to your account is trying to redirect your income.",
      `This link expires in ${CHANGE_CONFIRM_TTL_HOURS} hours.`,
    ],
    action: { label: "Confirm the change", href: confirmUrl },
    idempotencyKey: `payment-link-change:${profile.id}:${hashLinkToken(token).slice(0, 24)}`,
  });

  logger.info("payment_link_change_requested", { userId: input.userId, host: link.host });
  return { status: "confirmation_sent", link };
}

export type ConfirmChangeResult =
  | { confirmed: true; host: string }
  | { confirmed: false; reason: "not_found" | "expired" };

/**
 * Apply a staged change.
 *
 * Conditional on the token still being the staged one, so a second click — or a click on an
 * older email after the teacher requested a different change — applies nothing.
 */
export async function confirmTeacherPaymentLinkChange(
  token: string,
): Promise<ConfirmChangeResult> {
  const tokenHash = hashLinkToken(token);
  const cutoff = new Date(Date.now() - CHANGE_CONFIRM_TTL_HOURS * 3_600_000);

  const profile = await db.teacherProfile.findUnique({
    where: { pendingPaymentLinkTokenHash: tokenHash },
    select: {
      id: true,
      pendingPaymentLinkUrl: true,
      pendingPaymentLinkHost: true,
      pendingPaymentLinkProviderId: true,
      pendingPaymentLinkRequestedAt: true,
      user: { select: { email: true } },
    },
  });
  if (!profile?.pendingPaymentLinkUrl || !profile.pendingPaymentLinkHost) {
    return { confirmed: false, reason: "not_found" };
  }
  if (!profile.pendingPaymentLinkRequestedAt || profile.pendingPaymentLinkRequestedAt < cutoff) {
    return { confirmed: false, reason: "expired" };
  }

  const applied = await db.teacherProfile.updateMany({
    where: { id: profile.id, pendingPaymentLinkTokenHash: tokenHash },
    data: {
      paymentLinkUrl: profile.pendingPaymentLinkUrl,
      paymentLinkHost: profile.pendingPaymentLinkHost,
      paymentLinkProviderId: profile.pendingPaymentLinkProviderId,
      paymentLinkSetAt: new Date(),
      pendingPaymentLinkUrl: null,
      pendingPaymentLinkHost: null,
      pendingPaymentLinkProviderId: null,
      pendingPaymentLinkTokenHash: null,
      pendingPaymentLinkRequestedAt: null,
    },
  });
  if (applied.count === 0) return { confirmed: false, reason: "not_found" };

  await notifyLinkActivity({
    email: profile.user.email,
    subject: "Your payment link was changed",
    heading: "Where students pay you has changed",
    paragraphs: [
      `Payments now go to ${profile.pendingPaymentLinkHost}.`,
      "If you did not do this, contact support immediately.",
    ],
    idempotencyKey: `payment-link-changed:${profile.id}:${tokenHash.slice(0, 24)}`,
  });

  logger.info("payment_link_changed", { profileId: profile.id, host: profile.pendingPaymentLinkHost });
  return { confirmed: true, host: profile.pendingPaymentLinkHost };
}

/** Remove the link entirely. Immediate — turning payments OFF is never the attack. */
export async function clearTeacherPaymentLink(userId: string): Promise<void> {
  await db.teacherProfile.updateMany({
    where: { userId },
    data: {
      paymentLinkUrl: null,
      paymentLinkHost: null,
      paymentLinkProviderId: null,
      paymentLinkSetAt: null,
      pendingPaymentLinkUrl: null,
      pendingPaymentLinkHost: null,
      pendingPaymentLinkProviderId: null,
      pendingPaymentLinkTokenHash: null,
      pendingPaymentLinkRequestedAt: null,
    },
  });
}

async function notifyLinkActivity(input: {
  email: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  action?: { label: string; href: string };
  idempotencyKey: string;
}): Promise<void> {
  // Category "security", not "payment": these are account-integrity alerts about where money
  // is directed, and a teacher must not be able to mute them by turning off payment emails.
  await enqueueEmail({
    recipient: input.email,
    subject: input.subject,
    category: "security",
    idempotencyKey: input.idempotencyKey,
    html: renderEmailTemplate({
      heading: input.heading,
      paragraphs: input.paragraphs,
      ...(input.action ? { action: input.action } : {}),
    }),
  }).catch((error: unknown) => {
    logger.error("payment_link_notification_failed", { error });
  });
}
