import { withJobCheckIn } from "@/server/jobs/check-in";
import { NextResponse } from "next/server";

import { logger } from "@/lib/observability/logger";
import { isCronAuthorized } from "@/lib/security/cron-auth";
import { expireUnansweredBookingRequests } from "@/server/bookings/confirmation";

/** Release the slots held by booking requests the teacher never answered. */
async function run(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const expired = await expireUnansweredBookingRequests();
    return NextResponse.json({ expired });
  } catch (error) {
    logger.error("expire_booking_requests_failed", { error });
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}

// QLT-04: each invocation checks in, so a job that stops firing is visible.
const handler = withJobCheckIn("expire-booking-requests", run);

export const POST = handler;
export const GET = handler;
