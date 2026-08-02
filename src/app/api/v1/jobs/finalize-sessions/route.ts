import { withJobCheckIn } from "@/server/jobs/check-in";
import { NextResponse } from "next/server";

import { logger } from "@/lib/observability/logger";
import { isCronAuthorized } from "@/lib/security/cron-auth";
import { finalizeExpiredSessions } from "@/server/video/sessions";

/**
 * Close out lessons whose scheduled end (plus grace) has passed.
 *
 * Without this, finalisation depended entirely on the teacher clicking "End" or somebody
 * reloading the session page. A forgotten click left the booking `confirmed` forever: the
 * student never saw the review form, refund eligibility was wrong, teacher analytics
 * undercounted, and the platform's north-star metric — completed sessions per month — was
 * silently deflated.
 */
async function run(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await finalizeExpiredSessions();
    if (result.completed || result.noShow) {
      logger.info("sessions_finalized", result);
    }
    return NextResponse.json(result);
  } catch (error) {
    logger.error("finalize_sessions_failed", { error });
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}

// QLT-04: each invocation checks in, so a job that stops firing is visible.
const handler = withJobCheckIn("finalize-sessions", run);

export const POST = handler;
export const GET = handler;
