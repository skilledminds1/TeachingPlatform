import { NextResponse } from "next/server";

import { isCronAuthorized } from "@/lib/security/cron-auth";
import { runSubscriptionLifecycle } from "@/server/billing/run-lifecycle";

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runSubscriptionLifecycle();
  return NextResponse.json({ ok: summary.failures === 0, ...summary });
}
