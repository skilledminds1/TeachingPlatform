import { type NextRequest, NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

const publicExact = new Set([
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/teachers",
]);

function isPublicRoute(pathname: string): boolean {
  if (publicExact.has(pathname)) return true;
  if (pathname.startsWith("/teachers/")) return true;
  if (pathname.startsWith("/auth/")) return true;
  if (pathname.startsWith("/api/v1/webhooks")) return true;
  if (pathname.startsWith("/api/v1/health")) return true;
  return false;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { response, userId } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (isPublicRoute(pathname)) {
    // Signed-in users hitting auth pages go to the app.
    if (userId && (pathname === "/login" || pathname === "/register")) {
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
