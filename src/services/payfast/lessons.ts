import { env } from "@/lib/env";
import { amountFromCents } from "@/lib/payments/routing";
import { createPayfastSignature } from "@/services/payfast/signature";

export function payfastCheckoutHost(): string {
  return env.PAYFAST_SANDBOX === "true"
    ? "https://sandbox.payfast.co.za/eng/process"
    : "https://www.payfast.co.za/eng/process";
}

/** Build a one-time lesson checkout with 100% Split Payment to the teacher merchant. */
export function buildPayfastLessonCheckout(input: {
  attemptId: string;
  bookingId: string;
  amountCents: number;
  teacherMerchantId: string;
  itemName: string;
  studentEmail?: string | null;
  studentName?: string | null;
}): { url: string; fields: Record<string, string> } {
  if (!env.PAYFAST_MERCHANT_ID || !env.PAYFAST_MERCHANT_KEY) {
    throw new Error("PayFast is not configured.");
  }

  const returnUrl = new URL(
    `/dashboard/bookings/${input.bookingId}?payment=return`,
    env.NEXT_PUBLIC_APP_URL,
  ).toString();
  const cancelUrl = new URL(
    `/dashboard/bookings/${input.bookingId}?payment=cancelled`,
    env.NEXT_PUBLIC_APP_URL,
  ).toString();
  const notifyUrl = new URL("/api/v1/webhooks/payfast", env.NEXT_PUBLIC_APP_URL).toString();

  const fields: Record<string, string> = {
    merchant_id: env.PAYFAST_MERCHANT_ID,
    merchant_key: env.PAYFAST_MERCHANT_KEY,
    return_url: returnUrl,
    cancel_url: cancelUrl,
    notify_url: notifyUrl,
    name_first: input.studentName?.split(" ")[0] || "Student",
    email_address: input.studentEmail || "",
    m_payment_id: input.attemptId,
    amount: amountFromCents(input.amountCents),
    item_name: input.itemName.slice(0, 100),
    custom_str1: "lesson",
    custom_str2: input.attemptId,
    custom_str3: input.bookingId,
    custom_str4: input.teacherMerchantId,
    // Split Payments: 100% to the teacher (zero platform commission)
    "setup[split_payment][merchant_id]": input.teacherMerchantId,
    "setup[split_payment][percentage]": "100",
  };

  const signature = createPayfastSignature(
    Object.entries(fields),
    env.PAYFAST_PASSPHRASE,
  );
  fields.signature = signature;

  return { url: payfastCheckoutHost(), fields };
}
