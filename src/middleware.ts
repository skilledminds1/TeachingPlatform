import { type NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

const publicExact = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/teachers",
  "/find-tutor",
  "/courses",
  "/subscribe",
  "/terms",
  "/privacy",
  "/refund-policy",
  "/teacher-agreement",
]);

function isPublicRoute(pathname: string): boolean {
  if (publicExact.has(pathname)) return true;
  if (pathname.startsWith("/teachers/")) return true;
  if (pathname.startsWith("/find-tutor/")) return true;
  if (pathname.startsWith("/courses/")) return true;
  if (pathname.startsWith("/certificates/")) return true;
  if (pathname.startsWith("/auth/")) return true;
  if (pathname.startsWith("/api/v1/webhooks")) return true;
  if (pathname.startsWith("/api/v1/health")) return true;
  // Job routes authenticate with a constant-time CRON_SECRET check in each handler.
  if (pathname.startsWith("/api/v1/jobs/")) return true;
  return false;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { response, userId } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (isPublicRoute(pathname)) {
    // Signed-in users hitting auth pages go to the app — preserve paid-plan checkout.
    if (userId && (pathname === "/login" || pathname === "/register")) {
      const plan = request.nextUrl.searchParams.get("plan");
      const billing = request.nextUrl.searchParams.get("billing") === "annual" ? "annual" : "monthly";
      const redirectParam = request.nextUrl.searchParams.get("redirect");

      if (plan && ["starter", "professional", "business"].includes(plan)) {
        const subscribeUrl = request.nextUrl.clone();
        subscribeUrl.pathname = "/subscribe";
        subscribeUrl.search = `plan=${plan}&interval=${billing}`;
        return NextResponse.redirect(subscribeUrl);
      }

      if (
        redirectParam &&
        redirectParam.startsWith("/") &&
        !redirectParam.startsWith("//")
      ) {
        return NextResponse.redirect(new URL(redirectParam, request.url));
      }

      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/dashboard";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
    return response;
  }

  if (!userId) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
