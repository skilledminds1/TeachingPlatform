import { NextResponse } from "next/server";

import { requireAuth } from "@/server/auth/session";
import { safeRedirectPathOr } from "@/lib/security/redirect";
import {
  exchangeGoogleCalendarCode,
  googleCalendarConfigured,
  upsertCalendarConnection,
} from "@/server/integrations/google-calendar";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  let returnTo = "/dashboard/teacher/bookings";
  let expectedUserId: string | null = null;
  if (stateRaw) {
    try {
      const state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8")) as {
        userId?: string;
        returnTo?: string;
      };
      returnTo = safeRedirectPathOr(state.returnTo, returnTo);
      expectedUserId = state.userId ?? null;
    } catch {
      // ignore malformed state
    }
  }

  if (error) {
    return NextResponse.redirect(new URL(`${returnTo}?google=denied`, request.url));
  }
  if (!googleCalendarConfigured() || !code) {
    return NextResponse.redirect(new URL(`${returnTo}?google=error`, request.url));
  }

  const user = await requireAuth();
  if (expectedUserId && expectedUserId !== user.id) {
    return NextResponse.redirect(new URL(`${returnTo}?google=error`, request.url));
  }

  try {
    const tokens = await exchangeGoogleCalendarCode(code);
    await upsertCalendarConnection({
      userId: user.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      email: tokens.email,
    });
    return NextResponse.redirect(new URL(`${returnTo}?google=connected`, request.url));
  } catch {
    return NextResponse.redirect(new URL(`${returnTo}?google=error`, request.url));
  }
}
