"use server";

import { createHash, randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { requireAuth, requireOrgMembership } from "@/server/auth/session";
import { hasFeature } from "@/server/billing/entitlements";
import {
  buildEmailIdempotencyKey,
  enqueueEmail,
} from "@/server/notifications/email-outbox";
import { renderEmailTemplate } from "@/services/email/templates";
import { fail, ok, type ActionResult } from "@/types/action";

const inviteSchema = z.object({
  organizationId: z.uuid(),
  email: z.email().transform((value) => value.trim().toLowerCase()),
  role: z.enum(["instructor", "student"]),
});

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createOrganizationInvite(
  input: unknown,
): Promise<ActionResult<{ inviteUrl: string; expiresAt: string }>> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid invitation.", "VALIDATION_ERROR");
  }

  const inviter = await requireOrgMembership(parsed.data.organizationId, ["admin"]);

  if (parsed.data.role === "instructor") {
    const teamEnabled = await hasFeature(parsed.data.organizationId, "team_teachers");
    if (!teamEnabled) {
      return fail(
        "Team teachers are available on the Business plan.",
        "PLAN_LIMIT_EXCEEDED",
      );
    }
  }

  const existingUser = await db.user.findUnique({
    where: { email: parsed.data.email },
    select: {
      memberships: {
        where: { organizationId: parsed.data.organizationId },
        select: { userId: true },
      },
    },
  });
  if (existingUser?.memberships.length) {
    return fail("This person is already an organization member.", "CONFLICT");
  }

  await db.organizationInvitation.updateMany({
    where: {
      organizationId: parsed.data.organizationId,
      email: parsed.data.email,
      status: "pending",
    },
    data: { status: "revoked" },
  });

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const invitation = await db.organizationInvitation.create({
    data: {
      organizationId: parsed.data.organizationId,
      email: parsed.data.email,
      role: parsed.data.role,
      tokenHash: hashToken(token),
      invitedById: inviter.id,
      expiresAt,
    },
    include: { organization: { select: { name: true } } },
  });

  const inviteUrl = new URL(`/invite/${token}`, env.NEXT_PUBLIC_APP_URL).toString();
  await enqueueEmail({
    recipient: parsed.data.email,
    subject: `Invitation to join ${invitation.organization.name}`,
    category: "transactional",
    idempotencyKey: buildEmailIdempotencyKey("organization.invite", invitation.id),
    html: renderEmailTemplate({
      heading: `Join ${invitation.organization.name}`,
      paragraphs: [
        `${inviter.name} invited you to join as ${parsed.data.role}.`,
        "This invitation expires in 7 days.",
      ],
      action: { label: "Accept invitation", href: inviteUrl },
    }),
  });
  revalidatePath("/dashboard/teacher/team");
  return ok({ inviteUrl, expiresAt: expiresAt.toISOString() });
}

export async function acceptOrganizationInvite(
  token: string,
): Promise<ActionResult<{ organizationName: string }>> {
  const user = await requireAuth();
  const tokenHash = hashToken(token);
  const invitation = await db.organizationInvitation.findUnique({
    where: { tokenHash },
    include: {
      organization: { select: { id: true, name: true } },
    },
  });

  if (!invitation || invitation.status !== "pending") {
    return fail("This invitation is invalid or no longer active.", "NOT_FOUND");
  }
  if (invitation.expiresAt <= new Date()) {
    await db.organizationInvitation.update({
      where: { id: invitation.id },
      data: { status: "expired" },
    });
    return fail("This invitation has expired.", "VALIDATION_ERROR");
  }
  if (invitation.email !== user.email.toLowerCase()) {
    return fail("Sign in with the email address that received this invitation.", "FORBIDDEN");
  }

  await db.$transaction([
    db.organizationMember.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: invitation.organizationId,
        },
      },
      update: { role: invitation.role },
      create: {
        userId: user.id,
        organizationId: invitation.organizationId,
        role: invitation.role,
      },
    }),
    db.organizationInvitation.update({
      where: { id: invitation.id },
      data: { status: "accepted", acceptedAt: new Date() },
    }),
  ]);

  return ok({ organizationName: invitation.organization.name });
}

export async function revokeOrganizationInvite(
  invitationId: string,
): Promise<ActionResult<{ revoked: true }>> {
  // SEC-14: this is a public RPC endpoint taking a raw string. Without validation a
  // non-uuid value reaches Prisma and raises P2023, which escapes the ActionResult contract
  // as an opaque 500 and makes error-based probing noisier than it needs to be.
  const parsedId = z.uuid().safeParse(invitationId);
  if (!parsedId.success) return fail("Invalid invitation.", "VALIDATION_ERROR");

  const invitation = await db.organizationInvitation.findUnique({
    where: { id: parsedId.data },
    select: { id: true, organizationId: true, status: true },
  });
  if (!invitation) return fail("Invitation not found.", "NOT_FOUND");

  await requireOrgMembership(invitation.organizationId, ["admin"]);
  if (invitation.status !== "pending") {
    return fail("Only pending invitations can be revoked.", "CONFLICT");
  }

  await db.organizationInvitation.update({
    where: { id: invitation.id },
    data: { status: "revoked" },
  });
  revalidatePath("/dashboard/teacher/team");
  return ok({ revoked: true });
}
