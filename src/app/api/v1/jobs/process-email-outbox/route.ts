import { NextResponse } from "next/server";

import { logger } from "@/lib/observability/logger";
import { isCronAuthorized } from "@/lib/security/cron-auth";
import { processEmailOutbox } from "@/server/notifications/process-outbox";

export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await processEmailOutbox()) });
  } catch (error) {
    logger.error("email_outbox_job_failed", { error });
    return NextResponse.json({ ok: false, error: "Email processing failed." }, { status: 500 });
  }
}
