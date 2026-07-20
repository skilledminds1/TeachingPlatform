import { NextResponse } from "next/server";

import { logger } from "@/lib/observability/logger";
import { isCronAuthorized } from "@/lib/security/cron-auth";
import { expireAbandonedPayments } from "@/server/payments/confirm";

/** Cron-friendly expiry for unpaid lesson bookings. */
async function run(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const expired = await expireAbandonedPayments();
    return NextResponse.json({ expired });
  } catch (error) {
    logger.error("expire_pending_payments_failed", { error });
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}

export const POST = run;
export const GET = run;
