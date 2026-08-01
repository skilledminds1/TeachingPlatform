import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { isLessonProviderEnabled } from "@/lib/payments/provider-flags";
import { requireTeacher } from "@/server/auth/session";

function paymentsRedirect(request: NextRequest, result: "connected" | "error") {
  const url = new URL("/dashboard/teacher/payments", request.url);
  url.searchParams.set(result, result === "connected" ? "paypal" : "paypal_oauth");
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  // SEC-02: this route is the attack surface. The partner-referral branch below fires on the
  // mere presence of attacker-controlled query params and writes providerAccountId with no
  // state check, so a crafted link repoints a teacher's payout destination. It is gated
  // behind the PayPal feature flag (default off) rather than hardened, because the flow is
  // being replaced by the Stripe rail and is functionally broken anyway -- it stores
  // PayPal's tracking id where the merchant id belongs.
  //
  // Do NOT enable LESSON_PAYMENTS_PAYPAL_ENABLED until the branch below requires the signed
  // paypal_connect_state cookie, verifies the merchant server-side against PayPal's
  // merchant-integrations lookup, and reads merchantIdInPayPal instead of merchantId.
  if (!isLessonProviderEnabled("paypal")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const trackingId = request.nextUrl.searchParams.get("tracking_id");
  const merchantId =
    request.nextUrl.searchParams.get("merchantId") ||
    request.nextUrl.searchParams.get("merchant_id");

  // Partner Referrals return path
  if (trackingId || merchantId) {
    try {
      const user = await requireTeacher();
      const account = await db.teacherPaymentAccount.findUnique({
        where: { userId_provider: { userId: user.id, provider: "paypal" } },
      });
      if (!account) return paymentsRedirect(request, "error");

      await db.teacherPaymentAccount.update({
        where: { id: account.id },
        data: {
          providerAccountId: merchantId || account.providerAccountId,
          onboardingStatus: merchantId ? "complete" : "pending",
          isActive: true,
          capabilities: merchantId ? ["payments", "refunds"] : [],
          metadata: {
            ...(typeof account.metadata === "object" && account.metadata
              ? (account.metadata as object)
              : {}),
            trackingId: trackingId ?? undefined,
            merchantId: merchantId ?? undefined,
          },
        },
      });
      return paymentsRedirect(request, "connected");
    } catch {
      return paymentsRedirect(request, "error");
    }
  }

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
      update: {
        providerAccountId,
        isActive: true,
        onboardingStatus: "complete",
        capabilities: ["payments"],
      },
      create: {
        userId: user.id,
        provider: "paypal",
        providerAccountId,
        isDefault: existingAccounts === 0,
        onboardingStatus: "complete",
        capabilities: ["payments"],
      },
    });

    return paymentsRedirect(request, "connected");
  } catch {
    return paymentsRedirect(request, "error");
  }
}
