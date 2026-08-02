import { withJobCheckIn } from "@/server/jobs/check-in";
import { NextResponse } from "next/server";

import { isCronAuthorized } from "@/lib/security/cron-auth";
import { runSubscriptionLifecycle } from "@/server/billing/run-lifecycle";

async function handleRequest(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runSubscriptionLifecycle();
  return NextResponse.json({ ok: summary.failures === 0, ...summary });
}

// QLT-04: each invocation checks in, so a job that stops firing is visible.
export const GET = withJobCheckIn("subscription-lifecycle", handleRequest);
