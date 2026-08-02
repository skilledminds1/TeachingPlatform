import { withJobCheckIn } from "@/server/jobs/check-in";
import { NextResponse } from "next/server";

import { logger } from "@/lib/observability/logger";
import { isCronAuthorized } from "@/lib/security/cron-auth";
import { processEmailOutbox } from "@/server/notifications/process-outbox";

export const maxDuration = 60;

async function handleRequest(request: Request) {
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

// QLT-04: each invocation checks in, so a job that stops firing is visible.
export const GET = withJobCheckIn("process-email-outbox", handleRequest);
