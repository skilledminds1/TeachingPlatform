import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { registerRoleSchema } from "@/lib/validations/auth";
import { getPostAuthRedirect, syncUserFromAuth } from "@/server/auth/session";
import { db } from "@/lib/db";

function safeRedirectPath(path: string | null): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return null;
  }
  return path;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"));
  const roleParse = registerRoleSchema.safeParse(searchParams.get("role"));
  const role = roleParse.success ? roleParse.data : undefined;

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const metadataRole = registerRoleSchema.safeParse(data.user.user_metadata?.role);
      await syncUserFromAuth(data.user, {
        role: role ?? (metadataRole.success ? metadataRole.data : undefined),
      });

      const sessionUser = await db.user.findUniqueOrThrow({
        where: { id: data.user.id },
        include: {
          memberships: {
            include: {
              organization: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      });

      const defaultDestination = await getPostAuthRedirect(sessionUser);
      const destination =
        defaultDestination === "/legal-review"
          ? `/legal-review${next ? `?next=${encodeURIComponent(next)}` : ""}`
          : next ?? defaultDestination;
      return NextResponse.redirect(new URL(destination, origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth_callback", origin));
}
