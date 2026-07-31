import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { requireAuth } from "@/server/auth/session";
import { safeRedirectPathOr } from "@/lib/security/redirect";
import {
  GOOGLE_CALENDAR_STATE_COOKIE,
  GOOGLE_CALENDAR_STATE_COOKIE_PATH,
} from "@/lib/integrations/google-calendar-oauth";
import {
  exchangeGoogleCalendarCode,
  googleCalendarConfigured,
  upsertCalendarConnection,
} from "@/server/integrations/google-calendar";

const DEFAULT_RETURN = "/dashboard/teacher/bookings";

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function parseState(
  raw: string | null,
): { nonce: string; userId: string; returnTo: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      nonce?: unknown;
      userId?: unknown;
      returnTo?: unknown;
    };
    if (typeof parsed.nonce !== "string" || !parsed.nonce) return null;
    if (typeof parsed.userId !== "string" || !parsed.userId) return null;
    return {
      nonce: parsed.nonce,
      userId: parsed.userId,
      returnTo: safeRedirectPathOr(
        typeof parsed.returnTo === "string" ? parsed.returnTo : null,
        DEFAULT_RETURN,
      ),
    };
  } catch {
    return null;
  }
}

/** Clear the single-use nonce so a captured state cannot be replayed. */
function withClearedState(response: NextResponse): NextResponse {
  response.cookies.set(GOOGLE_CALENDAR_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: GOOGLE_CALENDAR_STATE_COOKIE_PATH,
    maxAge: 0,
  });
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = parseState(url.searchParams.get("state"));
  const oauthError = url.searchParams.get("error");
  const returnTo = state?.returnTo ?? DEFAULT_RETURN;

  const fail = (reason: string) =>
    withClearedState(
      NextResponse.redirect(new URL(`${returnTo}?google=${reason}`, request.url)),
    );

  if (oauthError) return fail("denied");
  if (!googleCalendarConfigured() || !code) return fail("error");

  // SEC-03: state must be present, well-formed, and match the nonce cookie minted at
  // /connect. The previous check was `if (expectedUserId && expectedUserId !== user.id)`,
  // which skipped validation entirely whenever state was absent or malformed — so an
  // attacker-supplied `code` with no state at all was exchanged and bound to whatever
  // session cookie happened to be attached.
  if (!state) return fail("invalid_state");

  const cookieNonce = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${GOOGLE_CALENDAR_STATE_COOKIE}=`))
    ?.slice(GOOGLE_CALENDAR_STATE_COOKIE.length + 1);

  if (!cookieNonce || !constantTimeEqual(cookieNonce, state.nonce)) {
    return fail("invalid_state");
  }

  const user = await requireAuth();
  if (state.userId !== user.id) return fail("invalid_state");

  try {
    const tokens = await exchangeGoogleCalendarCode(code);
    await upsertCalendarConnection({
      userId: user.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      email: tokens.email,
    });
    return withClearedState(
      NextResponse.redirect(new URL(`${returnTo}?google=connected`, request.url)),
    );
  } catch {
    return fail("error");
  }
}
