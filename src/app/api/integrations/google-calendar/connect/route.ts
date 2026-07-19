import { NextResponse } from "next/server";

import { requireAuth } from "@/server/auth/session";
import {
  buildGoogleCalendarAuthUrl,
  googleCalendarConfigured,
} from "@/server/integrations/google-calendar";

export async function GET(request: Request) {
  if (!googleCalendarConfigured()) {
    return NextResponse.redirect(
      new URL("/dashboard/teacher/bookings?google=missing_config", request.url),
    );
  }

  const user = await requireAuth();
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("returnTo") ?? "/dashboard/teacher/bookings";
  const safeReturn =
    returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/dashboard/teacher/bookings";

  const state = Buffer.from(
    JSON.stringify({ userId: user.id, returnTo: safeReturn }),
  ).toString("base64url");

  return NextResponse.redirect(buildGoogleCalendarAuthUrl(state));
}
