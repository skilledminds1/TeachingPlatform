import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { requireTeacher } from "@/server/auth/session";

function paymentsRedirect(request: NextRequest, result: "connected" | "error") {
  const url = new URL("/dashboard/teacher/payments", request.url);
  url.searchParams.set(result, result === "connected" ? "paypal" : "paypal_oauth");
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("paypal_connect_state")?.value;
  cookieStore.delete("paypal_connect_state");

  if (
    !code ||
    !state ||
    !expectedState ||
    state !== expectedState ||
    !env.PAYPAL_CLIENT_ID ||
    !env.PAYPAL_CLIENT_SECRET
  ) {
    return paymentsRedirect(request, "error");
  }

  const apiHost =
    env.PAYPAL_ENVIRONMENT === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";

  try {
    const user = await requireTeacher();
    const credentials = Buffer.from(
      `${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`,
    ).toString("base64");
    const tokenResponse = await fetch(`${apiHost}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: new URL(
          "/api/v1/payments/paypal/callback",
          env.NEXT_PUBLIC_APP_URL,
        ).toString(),
      }),
      cache: "no-store",
    });
    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenResponse.ok || !token.access_token) {
      return paymentsRedirect(request, "error");
    }

    const profileResponse = await fetch(
      `${apiHost}/v1/identity/openidconnect/userinfo/?schema=openid`,
      {
        headers: { Authorization: `Bearer ${token.access_token}` },
        cache: "no-store",
      },
    );
    const profile = (await profileResponse.json()) as {
      payer_id?: string;
      user_id?: string;
    };
    const providerAccountId = profile.payer_id ?? profile.user_id;
    if (!profileResponse.ok || !providerAccountId) {
      return paymentsRedirect(request, "error");
    }

    const existingAccounts = await db.teacherPaymentAccount.count({
      where: { userId: user.id, isActive: true },
    });
    await db.teacherPaymentAccount.upsert({
      where: { userId_provider: { userId: user.id, provider: "paypal" } },
      update: { providerAccountId, isActive: true },
      create: {
        userId: user.id,
        provider: "paypal",
        providerAccountId,
        isDefault: existingAccounts === 0,
      },
    });

    return paymentsRedirect(request, "connected");
  } catch {
    return paymentsRedirect(request, "error");
  }
}
