import type { ComplianceEventKind, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { logger } from "@/lib/observability/logger";

/**
 * Audit trail for compliance decisions (INT-13).
 *
 * AdminAuditLog cannot serve here: it requires an adminUserId, and the decisions that matter
 * most — a registration refused by the jurisdiction check — have no admin actor and often no
 * user row yet. Hence the optional user reference alongside a plain email.
 *
 * Recording NEVER blocks the decision it describes. If the write fails the refusal still
 * stands; we log and move on, because failing open on a sanctions check to preserve an audit
 * row would be exactly the wrong trade.
 */
export async function recordComplianceEvent(input: {
  kind: ComplianceEventKind;
  userId?: string | null;
  email?: string | null;
  countryCode?: string | null;
  detail?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await db.complianceEvent.create({
      data: {
        kind: input.kind,
        userId: input.userId ?? null,
        email: input.email ?? null,
        countryCode: input.countryCode ?? null,
        detail: input.detail,
      },
    });
  } catch (error) {
    logger.error("compliance_event_write_failed", {
      kind: input.kind,
      error: String(error),
    });
  }
}
