import { type NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";
import {
  buildContentSecurityPolicy,
  CSP_NONCE_HEADER,
  generateCspNonce,
} from "@/lib/security/csp";
import { safeRedirectPath } from "@/lib/security/redirect";

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
  // GLO-02: crawl directives and the URL inventory. These are generated routes, so without
  // an entry here they fall through to the auth check and answer 307 → /login — which is
  // what production did. A crawler asking what it may read was sent to a sign-in page.
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
]);

function isPublicRoute(pathname: string): boolean {
  if (publicExact.has(pathname)) return true;
  // Reserved by RFC 8615 for exactly this: things fetched by machines, before any session
  // exists. Redirecting them to a login page is never the right answer.
  if (pathname.startsWith("/.well-known/")) return true;
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
  // SEC-12: the CSP is built per request so it can carry a fresh nonce, which is why it
  // lives here rather than in next.config.ts. The nonce is set on the *request* headers so
  // Next applies it to its own hydration scripts and server components can read it for
  // next-themes; it is also echoed on the response for debugging.
  const nonce = generateCspNonce();
  request.headers.set(CSP_NONCE_HEADER, nonce);
  const csp = buildContentSecurityPolicy({
    nonce,
    isProduction: process.env.NODE_ENV === "production",
  });

  const result = await handleRequest(request);
  result.headers.set("Content-Security-Policy", csp);
  result.headers.set(CSP_NONCE_HEADER, nonce);
  return result;
}

async function handleRequest(request: NextRequest): Promise<NextResponse> {
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

      const safeRedirect = safeRedirectPath(redirectParam, request.nextUrl.origin);
      if (safeRedirect) {
        return NextResponse.redirect(new URL(safeRedirect, request.url));
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
