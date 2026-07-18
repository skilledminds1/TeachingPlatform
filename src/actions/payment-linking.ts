"use server";

import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";

import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { requireTeacher } from "@/server/auth/session";
import { fail, ok, type ActionResult } from "@/types/action";

const stateCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: env.NEXT_PUBLIC_APP_URL.startsWith("https://"),
  maxAge: 10 * 60,
  path: "/",
};

export async function startStripeConnect(): Promise<ActionResult<{ url: string }>> {
  await requireTeacher();
  if (!env.STRIPE_CONNECT_CLIENT_ID || !env.STRIPE_SECRET_KEY) {
    return fail("Stripe Connect is not configured yet.", "VALIDATION_ERROR");
  }

  const state = randomBytes(32).toString("base64url");
  (await cookies()).set("stripe_connect_state", state, stateCookieOptions);

  const url = new URL("https://connect.stripe.com/oauth/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.STRIPE_CONNECT_CLIENT_ID);
  url.searchParams.set("scope", "read_write");
  url.searchParams.set(
    "redirect_uri",
    new URL("/api/v1/payments/stripe/callback", env.NEXT_PUBLIC_APP_URL).toString(),
  );
  url.searchParams.set("state", state);

  return ok({ url: url.toString() });
}

export async function startPayPalConnect(): Promise<ActionResult<{ url: string }>> {
  await requireTeacher();
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    return fail("PayPal linking is not configured yet.", "VALIDATION_ERROR");
  }

  const state = randomBytes(32).toString("base64url");
  (await cookies()).set("paypal_connect_state", state, stateCookieOptions);

  const host =
    env.PAYPAL_ENVIRONMENT === "live"
      ? "https://www.paypal.com"
      : "https://www.sandbox.paypal.com";
  const url = new URL("/signin/authorize", host);
  url.searchParams.set("flowEntry", "static");
  url.searchParams.set("client_id", env.PAYPAL_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email");
  url.searchParams.set(
    "redirect_uri",
    new URL("/api/v1/payments/paypal/callback", env.NEXT_PUBLIC_APP_URL).toString(),
  );
  url.searchParams.set("state", state);

  return ok({ url: url.toString() });
}

export async function disconnectPaymentAccount(
  provider: "stripe" | "paypal",
): Promise<ActionResult<{ disconnected: true }>> {
  const user = await requireTeacher();
  await db.teacherPaymentAccount.deleteMany({
    where: { userId: user.id, provider },
  });
  return ok({ disconnected: true });
}
