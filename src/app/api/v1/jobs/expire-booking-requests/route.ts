import { withJobCheckIn } from "@/server/jobs/check-in";
import { NextResponse } from "next/server";

import { logger } from "@/lib/observability/logger";
import { deleteExpiredRateLimits } from "@/lib/security/rate-limit";
import { isCronAuthorized } from "@/lib/security/cron-auth";
import { expireUnansweredBookingRequests } from "@/server/bookings/confirmation";

/**
 * Release the slots held by booking requests the teacher never answered.
 *
 * The rate-limit sweep rides along here rather than getting its own cron. Both jobs clear
 * expired holds, this runs every 10 minutes which is far more often than the sweep needs, and
 * a dedicated workflow entry to delete a handful of inert rows would be more moving parts than
 * the problem deserves. It cannot fail the job it shares: an unswept table is untidy, an
 * unreleased slot is a teacher's calendar permanently blocked.
 */
async function run(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const expired = await expireUnansweredBookingRequests();
    const rateLimitsSwept = await deleteExpiredRateLimits();
    return NextResponse.json({ expired, rateLimitsSwept });
  } catch (error) {
    logger.error("expire_booking_requests_failed", { error });
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}

// QLT-04: each invocation checks in, so a job that stops firing is visible.
const handler = withJobCheckIn("expire-booking-requests", run);

export const POST = handler;
export const GET = handler;
