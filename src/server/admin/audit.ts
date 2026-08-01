import { db } from "@/lib/db";
import { logger } from "@/lib/observability/logger";
import type { Prisma } from "@prisma/client";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Record a platform-admin action against the audit log.
 *
 * SEC-13: write actions already logged consistently, but *reads* of private data did not —
 * teacher qualification and ID documents, platform-wide payment data, and analytics exports
 * were all readable by any platform admin with no record of who looked or why. PROJECT.md
 * states admins "cannot access org-private data without audit reason" and that "all admin
 * actions [are] logged to AdminAuditLog", so the read paths were contradicting the product's
 * own commitment.
 *
 * Never let an audit failure block the request it describes — log loudly instead, so a
 * transient database error cannot lock an admin out of their own tooling.
 *
 * `targetId` is a required uuid column. For platform-wide actions with no single subject
 * (an analytics export, say), pass the admin's own id and a `targetType` of "platform".
 */
export async function recordAdminAccess(input: {
  adminUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  if (!isUuid(input.targetId)) {
    logger.warn("admin_audit_skipped_invalid_target", {
      action: input.action,
      targetId: input.targetId,
    });
    return;
  }

  try {
    await db.adminAuditLog.create({
      data: {
        adminUserId: input.adminUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata,
      },
    });
  } catch (error) {
    logger.error("admin_audit_write_failed", { error, action: input.action });
  }
}
