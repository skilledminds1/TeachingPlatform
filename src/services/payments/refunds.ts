import { env } from "@/lib/env";
import { providerAmount } from "@/lib/payments/routing";
import { getPayPalAccessToken } from "@/services/paypal/checkout";

export async function refundPayPalCapture(input: {
  captureId: string;
  amountCents: number;
  currency: string;
}): Promise<{ refundId: string }> {
  const token = await getPayPalAccessToken();
  const host =
    env.PAYPAL_ENVIRONMENT === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";
  const response = await fetch(`${host}/v2/payments/captures/${input.captureId}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(env.PAYPAL_BN_CODE ? { "PayPal-Partner-Attribution-Id": env.PAYPAL_BN_CODE } : {}),
    },
    body: JSON.stringify({
      amount: {
        value: providerAmount(input.amountCents, input.currency),
        currency_code: input.currency,
      },
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`PayPal refund failed: ${(await response.text()).slice(0, 200)}`);
  }
  const data = (await response.json()) as { id: string };
  return { refundId: data.id };
}

