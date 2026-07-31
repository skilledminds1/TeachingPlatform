import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { requireAuth } from "@/server/auth/session";
import { safeRedirectPathOr } from "@/lib/security/redirect";
import {
  GOOGLE_CALENDAR_STATE_COOKIE,
  GOOGLE_CALENDAR_STATE_COOKIE_PATH,
  GOOGLE_CALENDAR_STATE_TTL_SECONDS,
} from "@/lib/integrations/google-calendar-oauth";
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
  const safeReturn = safeRedirectPathOr(
    url.searchParams.get("returnTo"),
    "/dashboard/teacher/bookings",
  );

  // SEC-03: bind the OAuth round-trip to a single-use nonce held in an httpOnly cookie.
  // The state value itself is not trusted — the callback compares it against this cookie.
  // Without that binding, an attacker could complete their own Google consent, capture the
  // resulting code, and get a signed-in teacher to load the callback URL, silently linking
  // the victim's account to the attacker's calendar.
  const nonce = randomBytes(32).toString("base64url");
  const state = Buffer.from(JSON.stringify({ nonce, userId: user.id, returnTo: safeReturn })).toString(
    "base64url",
  );

  const response = NextResponse.redirect(buildGoogleCalendarAuthUrl(state));
  response.cookies.set(GOOGLE_CALENDAR_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: GOOGLE_CALENDAR_STATE_COOKIE_PATH,
    maxAge: GOOGLE_CALENDAR_STATE_TTL_SECONDS,
  });
  return response;
}
