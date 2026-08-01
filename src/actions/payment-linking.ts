"use server";

import { randomBytes, randomUUID } from "node:crypto";

import { cookies } from "next/headers";

import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { isLessonProviderEnabled } from "@/lib/payments/provider-flags";
import { requireTeacher } from "@/server/auth/session";
import { createPayPalSellerReferral } from "@/services/paypal/checkout";
import { fail, ok, type ActionResult } from "@/types/action";

const stateCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NEXT_PUBLIC_APP_URL.startsWith("https://"),
  maxAge: 10 * 60,
  path: "/",
};

export async function startPayPalConnect(): Promise<ActionResult<{ url: string }>> {
  const user = await requireTeacher();

  // SEC-02: PayPal linking is gated behind the same flag as PayPal lesson payments.
  //
  // The partner-referral return branch of the callback has no CSRF state check, so a crafted
  // link can repoint a teacher's payout account to an attacker's merchant id. That flow is
  // also functionally broken -- it stores PayPal's tracking id where the merchant id belongs,
  // so live partner checkout would fail for every teacher regardless.
  //
  // Rather than harden a flow being replaced by the Stripe rail, no account can be created
  // while the flag is off, which is the precondition for the CSRF. Keep the integration in
  // the tree: PayPal reaches teacher countries Stripe does not (Philippines, Vietnam,
  // Pakistan, Bangladesh, Egypt, much of LatAm). Before ever setting this flag to "true",
  // fix the callback: require the signed state cookie on BOTH branches, verify the merchant
  // server-side via PayPal's merchant-integrations lookup, and read merchantIdInPayPal.
  if (!isLessonProviderEnabled("paypal")) {
    return fail("PayPal linking is not available.", "VALIDATION_ERROR");
  }

  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    return fail("PayPal linking is not configured yet.", "VALIDATION_ERROR");
  }

  const trackingId = `teacher_${user.id.slice(0, 8)}_${randomBytes(4).toString("hex")}`;
  const returnUrl = new URL(
    "/api/v1/payments/paypal/callback",
    env.NEXT_PUBLIC_APP_URL,
  ).toString();

  try {
    // Preferred: Partner Referrals (requires marketplace partner approval)
    const referral = await createPayPalSellerReferral({
      trackingId,
      returnUrl: `${returnUrl}?tracking_id=${encodeURIComponent(trackingId)}`,
    });

    await db.teacherPaymentAccount.upsert({
      where: { userId_provider: { userId: user.id, provider: "paypal" } },
      create: {
        id: randomUUID(),
        userId: user.id,
        provider: "paypal",
        providerAccountId: trackingId,
        onboardingStatus: "pending",
        isDefault: false,
        isActive: true,
        metadata: { trackingId },
      },
      update: {
        providerAccountId: trackingId,
        onboardingStatus: "pending",
        isActive: true,
        metadata: { trackingId },
      },
    });

    return ok({ url: referral.actionUrl });
  } catch {
    if (env.PAYPAL_ENVIRONMENT === "live") {
      return fail(
        "PayPal marketplace onboarding is not ready. Add the approved partner details and webhook ID first.",
        "VALIDATION_ERROR",
      );
    }

    // Sandbox-only fallback before marketplace partner approval.
    const state = randomBytes(32).toString("base64url");
    (await cookies()).set("paypal_connect_state", state, stateCookieOptions);
    const host = "https://www.sandbox.paypal.com";
    const url = new URL("/signin/authorize", host);
    url.searchParams.set("flowEntry", "static");
    url.searchParams.set("client_id", env.PAYPAL_CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email");
    url.searchParams.set("redirect_uri", returnUrl);
    url.searchParams.set("state", state);
    return ok({ url: url.toString() });
  }
}

export async function disconnectPaymentAccount(
  provider: "paypal",
): Promise<ActionResult<{ disconnected: true }>> {
  const user = await requireTeacher();
  await db.teacherPaymentAccount.deleteMany({
    where: { userId: user.id, provider },
  });
  return ok({ disconnected: true });
}
