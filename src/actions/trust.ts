"use server";

import type { EnforcementScope, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db, type DbTransactionClient } from "@/lib/db";
import {
  requireAuth,
  requireAuthenticatedIdentity,
  requirePlatformAdmin,
} from "@/server/auth/session";
import { canAccessModerationCase } from "@/server/trust/cases";
import { enforceActionRateLimit } from "@/server/security/action-rate-limit";
import {
  notifyModerationCaseUpdated,
  notifySafetyReportUpdated,
} from "@/server/notifications/notify";
import { fail, ok, type ActionResult } from "@/types/action";

const uuid = z.uuid();
const explanation = z.string().trim().min(20).max(4_000);
const optionalEvidence = z.string().trim().max(4_000).optional();

const reportSchema = z.object({
  subjectId: uuid.optional(),
  category: z.enum(["harassment", "fraud", "unsafe_conduct", "privacy", "other"]),
  description: explanation,
  targetType: z.enum(["user", "booking", "message"]).optional(),
  targetId: uuid.optional(),
});

export async function createSafetyReport(
  input: unknown,
): Promise<ActionResult<{ reportId: string }>> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return fail("Provide a valid report with enough detail.", "VALIDATION_ERROR");
  const user = await requireAuth();
  const limited = await enforceActionRateLimit({
    action: "safety-report",
    limit: 5,
    windowMs: 60 * 60_000,
    userId: user.id,
  });
  if (limited) return limited;
  if (parsed.data.subjectId === user.id) {
    return fail("You cannot report your own account.", "VALIDATION_ERROR");
  }
  if (parsed.data.subjectId) {
    const exists = await db.user.count({ where: { id: parsed.data.subjectId } });
    if (!exists) return fail("Reported user not found.", "NOT_FOUND");
  }
  const report = await db.safetyReport.create({
    data: { reporterId: user.id, ...parsed.data },
    select: { id: true },
  });
  revalidatePath("/dashboard/safety");
  revalidatePath("/admin/trust");
  return ok({ reportId: report.id });
}

export async function blockUser(
  input: unknown,
): Promise<ActionResult<{ blocked: true }>> {
  const parsed = z.object({ userId: uuid, reason: z.string().trim().max(500).optional() }).safeParse(input);
  if (!parsed.success) return fail("Invalid user.", "VALIDATION_ERROR");
  const user = await requireAuth();
  if (parsed.data.userId === user.id) return fail("You cannot block yourself.", "VALIDATION_ERROR");
  const target = await db.user.count({ where: { id: parsed.data.userId } });
  if (!target) return fail("User not found.", "NOT_FOUND");
  await db.userBlock.upsert({
    where: { blockerId_blockedId: { blockerId: user.id, blockedId: parsed.data.userId } },
    update: { reason: parsed.data.reason || null },
    create: { blockerId: user.id, blockedId: parsed.data.userId, reason: parsed.data.reason },
  });
  revalidatePath("/dashboard/safety");
  return ok({ blocked: true });
}

export async function unblockUser(
  input: unknown,
): Promise<ActionResult<{ unblocked: true }>> {
  const parsed = z.object({ userId: uuid }).safeParse(input);
  if (!parsed.success) return fail("Invalid user.", "VALIDATION_ERROR");
  const user = await requireAuth();
  await db.userBlock.deleteMany({ where: { blockerId: user.id, blockedId: parsed.data.userId } });
  revalidatePath("/dashboard/safety");
  return ok({ unblocked: true });
}

export async function reviewSafetyReport(
  input: unknown,
): Promise<ActionResult<{ updated: true }>> {
  const parsed = z.object({
    reportId: uuid,
    status: z.enum(["triaged", "investigating", "resolved", "dismissed"]),
    resolution: z.string().trim().max(4_000).optional(),
  }).safeParse(input);
  if (!parsed.success) return fail("Invalid report update.", "VALIDATION_ERROR");
  if (["resolved", "dismissed"].includes(parsed.data.status) && !parsed.data.resolution) {
    return fail("A resolution is required.", "VALIDATION_ERROR");
  }
  const admin = await requirePlatformAdmin();
  await db.$transaction(async (tx) => {
    await tx.safetyReport.update({
      where: { id: parsed.data.reportId },
      data: {
        status: parsed.data.status,
        resolution: parsed.data.resolution || null,
        resolvedAt: ["resolved", "dismissed"].includes(parsed.data.status) ? new Date() : null,
      },
    });
    await audit(tx, admin.id, "safety_report.reviewed", "SafetyReport", parsed.data.reportId, parsed.data);
  });
  revalidatePath("/admin/trust");
  revalidatePath("/dashboard/safety");
  await notifySafetyReportUpdated(parsed.data.reportId).catch(() => undefined);
  return ok({ updated: true });
}

export async function sendCaseMessage(
  input: unknown,
): Promise<ActionResult<{ messageId: string }>> {
  const parsed = z.object({ caseId: uuid, body: z.string().trim().min(1).max(4_000) }).safeParse(input);
  if (!parsed.success) return fail("Enter a message.", "VALIDATION_ERROR");
  const user = await requireAuthenticatedIdentity();
  const limited = await enforceActionRateLimit({
    action: "case-message",
    limit: 20,
    windowMs: 10 * 60_000,
    userId: user.id,
  });
  if (limited) return limited;
  if (!(await canAccessModerationCase(parsed.data.caseId, user))) {
    return fail("Case not found.", "NOT_FOUND");
  }
  const message = await db.caseMessage.create({
    data: { caseId: parsed.data.caseId, senderId: user.id, body: parsed.data.body },
    select: { id: true },
  });
  revalidateCase(parsed.data.caseId);
  await notifyModerationCaseUpdated(parsed.data.caseId, `message:${message.id}`).catch(
    () => undefined,
  );
  return ok({ messageId: message.id });
}

export async function addCaseNote(
  input: unknown,
): Promise<ActionResult<{ noteId: string }>> {
  const parsed = z.object({ caseId: uuid, body: explanation }).safeParse(input);
  if (!parsed.success) return fail("Private note must be at least 20 characters.", "VALIDATION_ERROR");
  const admin = await requirePlatformAdmin();
  const note = await db.$transaction(async (tx) => {
    const created = await tx.caseNote.create({
      data: { caseId: parsed.data.caseId, authorId: admin.id, body: parsed.data.body },
      select: { id: true },
    });
    await audit(tx, admin.id, "case.private_note_added", "ModerationCase", parsed.data.caseId);
    return created;
  });
  revalidateCase(parsed.data.caseId);
  return ok({ noteId: note.id });
}

export async function registerCaseEvidence(
  input: unknown,
): Promise<ActionResult<{ evidenceId: string }>> {
  const parsed = z.object({
    caseId: uuid,
    storagePath: z.string().trim().min(10).max(500),
    fileName: z.string().trim().min(1).max(200),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"]),
    sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
    description: z.string().trim().max(1_000).optional(),
  }).safeParse(input);
  if (!parsed.success) return fail("Invalid evidence metadata.", "VALIDATION_ERROR");
  const user = await requireAuthenticatedIdentity();
  const limited = await enforceActionRateLimit({
    action: "case-evidence",
    limit: 10,
    windowMs: 60 * 60_000,
    userId: user.id,
  });
  if (limited) return limited;
  if (!(await canAccessModerationCase(parsed.data.caseId, user))) {
    return fail("Case not found.", "NOT_FOUND");
  }
  const requiredPrefix = `case-evidence/${parsed.data.caseId}/${user.id}/`;
  if (!parsed.data.storagePath.startsWith(requiredPrefix) || parsed.data.storagePath.includes("..")) {
    return fail("Evidence path is not authorized.", "FORBIDDEN");
  }
  const evidence = await db.caseEvidence.create({
    data: { ...parsed.data, uploadedById: user.id },
    select: { id: true },
  });
  revalidateCase(parsed.data.caseId);
  return ok({ evidenceId: evidence.id });
}

export async function updateModerationCase(
  input: unknown,
): Promise<ActionResult<{ updated: true }>> {
  const parsed = z.object({
    caseId: uuid,
    status: z.enum(["open", "under_review", "awaiting_response", "resolved", "closed"]),
    priority: z.enum(["low", "normal", "high", "urgent"]),
    assignedAdminId: uuid.nullable().optional(),
    resolution: z.string().trim().max(4_000).optional(),
  }).safeParse(input);
  if (!parsed.success) return fail("Invalid case update.", "VALIDATION_ERROR");
  const admin = await requirePlatformAdmin();
  if (parsed.data.assignedAdminId) {
    const assignee = await db.user.findFirst({
      where: { id: parsed.data.assignedAdminId, isPlatformAdmin: true },
      select: { id: true },
    });
    if (!assignee) return fail("Assigned admin not found.", "VALIDATION_ERROR");
  }
  if (["resolved", "closed"].includes(parsed.data.status) && !parsed.data.resolution) {
    return fail("A resolution is required to close a case.", "VALIDATION_ERROR");
  }
  await db.$transaction(async (tx) => {
    await tx.moderationCase.update({
      where: { id: parsed.data.caseId },
      data: {
        status: parsed.data.status,
        priority: parsed.data.priority,
        assignedAdminId: parsed.data.assignedAdminId,
        resolution: parsed.data.resolution || null,
        resolvedAt: ["resolved", "closed"].includes(parsed.data.status) ? new Date() : null,
      },
    });
    await audit(tx, admin.id, "case.updated", "ModerationCase", parsed.data.caseId, parsed.data);
  });
  revalidateCase(parsed.data.caseId);
  await notifyModerationCaseUpdated(
    parsed.data.caseId,
    `status:${parsed.data.status}:${Date.now()}`,
  ).catch(() => undefined);
  return ok({ updated: true });
}

const sanctionSchema = z.object({
  caseId: uuid,
  userId: uuid,
  type: z.enum(["warning", "restriction", "suspension", "delist", "removal"]),
  scopes: z.array(z.enum(["messaging", "booking", "selling", "publishing"])).default([]),
  reason: explanation,
  evidence: optionalEvidence,
  endsAt: z.iso.datetime().optional(),
});

export async function issueSanction(
  input: unknown,
): Promise<ActionResult<{ sanctionId: string }>> {
  const parsed = sanctionSchema.safeParse(input);
  if (!parsed.success) return fail("Provide a valid sanction, reason, and evidence.", "VALIDATION_ERROR");
  const admin = await requirePlatformAdmin();
  const target = await db.user.findUnique({
    where: { id: parsed.data.userId },
    select: {
      id: true,
      isPlatformAdmin: true,
      teacherProfile: { select: { id: true } },
      memberships: { where: { role: { in: ["admin", "instructor"] } }, select: { userId: true }, take: 1 },
    },
  });
  if (!target?.teacherProfile || target.memberships.length === 0 || target.isPlatformAdmin) {
    return fail("Sanctions from this control are limited to teacher accounts.", "FORBIDDEN");
  }
  const caseRecord = await db.moderationCase.findUnique({
    where: { id: parsed.data.caseId },
    select: { subjectId: true },
  });
  if (!caseRecord || (caseRecord.subjectId && caseRecord.subjectId !== target.id)) {
    return fail("The teacher is not the subject of this case.", "FORBIDDEN");
  }
  const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null;
  if (endsAt && endsAt <= new Date()) return fail("End date must be in the future.", "VALIDATION_ERROR");
  const scopes = normalizedScopes(parsed.data.type, parsed.data.scopes);

  const sanction = await db.$transaction(async (tx) => {
    const created = await tx.sanction.create({
      data: {
        caseId: parsed.data.caseId,
        userId: target.id,
        issuedById: admin.id,
        type: parsed.data.type,
        scopes,
        reason: parsed.data.reason,
        evidence: parsed.data.evidence,
        endsAt,
      },
      select: { id: true },
    });
    await applySanctionState(tx, target.id, parsed.data.type, parsed.data.reason, endsAt);
    await audit(tx, admin.id, `sanction.${parsed.data.type}`, "User", target.id, {
      caseId: parsed.data.caseId,
      sanctionId: created.id,
      scopes,
      reason: parsed.data.reason,
      evidence: parsed.data.evidence,
      endsAt,
    });
    return created;
  });
  revalidateCase(parsed.data.caseId);
  revalidatePath("/admin/trust");
  return ok({ sanctionId: sanction.id });
}

export async function submitAppeal(
  input: unknown,
): Promise<ActionResult<{ appealId: string }>> {
  const parsed = z.object({ sanctionId: uuid, reason: explanation, evidence: optionalEvidence }).safeParse(input);
  if (!parsed.success) return fail("Provide a detailed appeal reason.", "VALIDATION_ERROR");
  const user = await requireAuthenticatedIdentity();
  const sanction = await db.sanction.findFirst({
    where: { id: parsed.data.sanctionId, userId: user.id },
    select: { id: true, caseId: true },
  });
  if (!sanction) return fail("Sanction not found.", "NOT_FOUND");
  try {
    const appeal = await db.appeal.create({
      data: {
        sanctionId: sanction.id,
        caseId: sanction.caseId,
        appellantId: user.id,
        reason: parsed.data.reason,
        evidence: parsed.data.evidence,
      },
      select: { id: true },
    });
    revalidatePath("/account-restricted");
    revalidatePath("/dashboard/safety");
    revalidatePath("/admin/trust/appeals");
    return ok({ appealId: appeal.id });
  } catch (error) {
    if (isUniqueConflict(error)) return fail("An appeal already exists for this sanction.", "CONFLICT");
    throw error;
  }
}

export async function reviewAppeal(
  input: unknown,
): Promise<ActionResult<{ updated: true }>> {
  const parsed = z.object({
    appealId: uuid,
    status: z.enum(["upheld", "overturned"]),
    decision: explanation,
  }).safeParse(input);
  if (!parsed.success) return fail("Provide a valid appeal decision.", "VALIDATION_ERROR");
  const admin = await requirePlatformAdmin();
  const appeal = await db.appeal.findUnique({
    where: { id: parsed.data.appealId },
    include: { sanction: { select: { id: true, userId: true, type: true, caseId: true } } },
  });
  if (!appeal || !["submitted", "under_review"].includes(appeal.status)) {
    return fail("Appeal is not awaiting review.", "CONFLICT");
  }
  await db.$transaction(async (tx) => {
    await tx.appeal.update({
      where: { id: appeal.id },
      data: {
        status: parsed.data.status,
        decision: parsed.data.decision,
        reviewerId: admin.id,
        reviewedAt: new Date(),
      },
    });
    if (parsed.data.status === "overturned") {
      await tx.sanction.update({
        where: { id: appeal.sanction.id },
        data: { revokedAt: new Date(), revokedReason: parsed.data.decision },
      });
      await restoreAfterOverturn(tx, appeal.sanction.userId, appeal.sanction.type);
    }
    await audit(tx, admin.id, `appeal.${parsed.data.status}`, "Appeal", appeal.id, {
      decision: parsed.data.decision,
      sanctionId: appeal.sanction.id,
    });
  });
  if (appeal.sanction.caseId) revalidateCase(appeal.sanction.caseId);
  revalidatePath("/admin/trust/appeals");
  return ok({ updated: true });
}

export async function submitPrivacyRequest(
  input: unknown,
): Promise<ActionResult<{ requestId: string }>> {
  const parsed = z.object({
    type: z.enum(["export", "deletion", "correction", "objection"]),
    details: z.string().trim().max(4_000).optional(),
  }).safeParse(input);
  if (!parsed.success) return fail("Invalid privacy request.", "VALIDATION_ERROR");
  const user = await requireAuthenticatedIdentity();
  const existing = await db.privacyRequest.findFirst({
    where: {
      requesterId: user.id,
      type: parsed.data.type,
      status: { in: ["submitted", "verifying", "in_progress"] },
    },
    select: { id: true },
  });
  if (existing) return fail("A request of this type is already in progress.", "CONFLICT");
  const request = await db.privacyRequest.create({
    data: { requesterId: user.id, type: parsed.data.type, details: parsed.data.details },
    select: { id: true },
  });
  revalidatePath("/dashboard/privacy");
  revalidatePath("/admin/trust/privacy");
  return ok({ requestId: request.id });
}

export async function updatePrivacyRequest(
  input: unknown,
): Promise<ActionResult<{ updated: true }>> {
  const parsed = z.object({
    requestId: uuid,
    status: z.enum(["verifying", "in_progress", "completed", "denied", "cancelled"]),
    response: z.string().trim().min(10).max(4_000),
  }).safeParse(input);
  if (!parsed.success) return fail("Provide a status and response.", "VALIDATION_ERROR");
  const admin = await requirePlatformAdmin();
  await db.$transaction(async (tx) => {
    await tx.privacyRequest.update({
      where: { id: parsed.data.requestId },
      data: {
        status: parsed.data.status,
        response: parsed.data.response,
        assignedAdminId: admin.id,
        completedAt: ["completed", "denied", "cancelled"].includes(parsed.data.status)
          ? new Date()
          : null,
      },
    });
    await audit(tx, admin.id, "privacy_request.updated", "PrivacyRequest", parsed.data.requestId, {
      status: parsed.data.status,
      response: parsed.data.response,
      retention: "Payment, audit, legal, and safety records are preserved where required.",
    });
  });
  revalidatePath("/admin/trust/privacy");
  return ok({ updated: true });
}

function normalizedScopes(
  type: "warning" | "restriction" | "suspension" | "delist" | "removal",
  requested: EnforcementScope[],
): EnforcementScope[] {
  if (type === "restriction") return requested.length ? requested : ["messaging"];
  if (type === "delist") return ["selling", "publishing"];
  if (type === "suspension" || type === "removal") {
    return ["messaging", "booking", "selling", "publishing"];
  }
  return [];
}

async function applySanctionState(
  tx: DbTransactionClient,
  userId: string,
  type: "warning" | "restriction" | "suspension" | "delist" | "removal",
  reason: string,
  endsAt: Date | null,
) {
  if (type === "warning") return;
  if (type === "delist") {
    await tx.teacherProfile.updateMany({
      where: { userId },
      data: { status: "rejected", rejectionReason: reason },
    });
    return;
  }
  await tx.user.update({
    where: { id: userId },
    data: {
      accountStatus: type === "restriction" ? "restricted" : type === "suspension" ? "suspended" : "removed",
      accountStatusReason: reason,
      accountRestrictedUntil: endsAt,
      deletedAt: type === "removal" ? new Date() : undefined,
    },
  });
  if (type === "removal") {
    await tx.teacherProfile.updateMany({
      where: { userId },
      data: { status: "rejected", rejectionReason: reason },
    });
  }
}

async function restoreAfterOverturn(
  tx: DbTransactionClient,
  userId: string,
  type: "warning" | "restriction" | "suspension" | "delist" | "removal",
) {
  if (type === "delist" || type === "removal") {
    await tx.teacherProfile.updateMany({
      where: { userId },
      data: { status: "pending_approval", rejectionReason: null, deletedAt: null },
    });
  }
  if (type !== "warning" && type !== "delist") {
    await tx.user.update({
      where: { id: userId },
      data: {
        accountStatus: "active",
        accountStatusReason: null,
        accountRestrictedUntil: null,
        deletedAt: type === "removal" ? null : undefined,
      },
    });
  }
}

async function audit(
  tx: DbTransactionClient,
  adminUserId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata?: Prisma.InputJsonValue,
) {
  await tx.adminAuditLog.create({
    data: { adminUserId, action, targetType, targetId, metadata },
  });
}

function revalidateCase(caseId: string) {
  revalidatePath(`/dashboard/cases/${caseId}`);
  revalidatePath(`/admin/trust/cases/${caseId}`);
  revalidatePath("/admin/trust");
}

function isUniqueConflict(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "P2002",
  );
}
