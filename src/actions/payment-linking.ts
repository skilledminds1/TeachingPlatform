"use server";

import { randomBytes, randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { z } from "zod";

import { env } from "@/lib/env";
import { db } from "@/lib/db";
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

const payfastLinkSchema = z.object({
  merchantId: z
    .string()
    .trim()
    .regex(/^\d{6,12}$/, "Enter your PayFast merchant ID"),
  country: z.literal("ZA").default("ZA"),
});

export async function startPayPalConnect(): Promise<ActionResult<{ url: string }>> {
  const user = await requireTeacher();
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

export async function linkPayFastMerchant(
  input: unknown,
): Promise<ActionResult<{ linked: true }>> {
  const parsed = payfastLinkSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid merchant ID.", "VALIDATION_ERROR");
  }
  const user = await requireTeacher();
  if (!env.PAYFAST_MERCHANT_ID) {
    return fail("PayFast is not configured on this platform yet.", "VALIDATION_ERROR");
  }

  const existingDefault = await db.teacherPaymentAccount.findFirst({
    where: { userId: user.id, isDefault: true, isActive: true },
    select: { id: true },
  });

  await db.teacherPaymentAccount.upsert({
    where: { userId_provider: { userId: user.id, provider: "payfast" } },
    create: {
      id: randomUUID(),
      userId: user.id,
      provider: "payfast",
      providerAccountId: parsed.data.merchantId,
      onboardingStatus: "complete",
      settlementCurrency: "ZAR",
      country: "ZA",
      capabilities: ["payments", "split_payments", "apple_pay", "google_pay"],
      isDefault: !existingDefault,
      isActive: true,
      metadata: { source: "manual_merchant_id" },
    },
    update: {
      providerAccountId: parsed.data.merchantId,
      onboardingStatus: "complete",
      settlementCurrency: "ZAR",
      country: "ZA",
      capabilities: ["payments", "split_payments", "apple_pay", "google_pay"],
      isActive: true,
      metadata: { source: "manual_merchant_id" },
    },
  });

  return ok({ linked: true });
}

export async function disconnectPaymentAccount(
  provider: "paypal" | "payfast",
): Promise<ActionResult<{ disconnected: true }>> {
  const user = await requireTeacher();
  await db.teacherPaymentAccount.deleteMany({
    where: { userId: user.id, provider },
  });
  return ok({ disconnected: true });
}
