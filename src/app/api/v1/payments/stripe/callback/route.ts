import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireTeacher } from "@/server/auth/session";

function paymentsRedirect(request: NextRequest, result: "connected" | "error") {
  const url = new URL("/dashboard/teacher/payments", request.url);
  url.searchParams.set(result, result === "connected" ? "stripe" : "stripe_oauth");
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("stripe_connect_state")?.value;
  cookieStore.delete("stripe_connect_state");

  if (
    !code ||
    !state ||
    !expectedState ||
    state !== expectedState ||
    !env.STRIPE_SECRET_KEY
  ) {
    return paymentsRedirect(request, "error");
  }

  try {
    const user = await requireTeacher();
    const body = new URLSearchParams({
      client_secret: env.STRIPE_SECRET_KEY,
      code,
      grant_type: "authorization_code",
    });
    const response = await fetch("https://connect.stripe.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });
    const result = (await response.json()) as {
      stripe_user_id?: string;
      error_description?: string;
    };
    if (!response.ok || !result.stripe_user_id) {
      return paymentsRedirect(request, "error");
    }

    const existingAccounts = await db.teacherPaymentAccount.count({
      where: { userId: user.id, isActive: true },
    });
    await db.teacherPaymentAccount.upsert({
      where: { userId_provider: { userId: user.id, provider: "stripe" } },
      update: {
        providerAccountId: result.stripe_user_id,
        isActive: true,
      },
      create: {
        userId: user.id,
        provider: "stripe",
        providerAccountId: result.stripe_user_id,
        isDefault: existingAccounts === 0,
      },
    });

    return paymentsRedirect(request, "connected");
  } catch {
    return paymentsRedirect(request, "error");
  }
}
