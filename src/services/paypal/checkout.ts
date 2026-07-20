import { env } from "@/lib/env";
import { amountFromCents } from "@/lib/payments/routing";

function paypalHost(): string {
  return env.PAYPAL_ENVIRONMENT === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

function paypalWebHost(): string {
  return env.PAYPAL_ENVIRONMENT === "live"
    ? "https://www.paypal.com"
    : "https://www.sandbox.paypal.com";
}

export async function getPayPalAccessToken(): Promise<string> {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
    throw new Error("PayPal is not configured.");
  }
  const auth = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString(
    "base64",
  );
  const response = await fetch(`${paypalHost()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("Unable to authenticate with PayPal.");
  }
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("PayPal access token missing.");
  return data.access_token;
}

export async function createPayPalSellerReferral(input: {
  trackingId: string;
  returnUrl: string;
}): Promise<{ actionUrl: string; referralId?: string }> {
  const token = await getPayPalAccessToken();
  const body = {
    tracking_id: input.trackingId,
    partner_config_override: {
      return_url: input.returnUrl,
      show_add_credit_card: true,
    },
    operations: [
      {
        operation: "API_INTEGRATION",
        api_integration_preference: {
          rest_api_integration: {
            integration_method: "PAYPAL",
            integration_type: "THIRD_PARTY",
            third_party_details: {
              features: ["PAYMENT", "REFUND"],
            },
          },
        },
      },
    ],
    products: ["EXPRESS_CHECKOUT"],
    legal_consents: [{ type: "SHARE_DATA_CONSENT", granted: true }],
  };

  const response = await fetch(`${paypalHost()}/v2/customer/partner-referrals`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(env.PAYPAL_BN_CODE ? { "PayPal-Partner-Attribution-Id": env.PAYPAL_BN_CODE } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PayPal seller onboarding failed: ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    links?: Array<{ rel: string; href: string }>;
  };
  const actionUrl = data.links?.find((link) => link.rel === "action_url")?.href;
  if (!actionUrl) throw new Error("PayPal did not return an onboarding URL.");
  return { actionUrl };
}

export async function createPayPalOrder(input: {
  attemptId: string;
  amountCents: number;
  currency: string;
  teacherMerchantId: string;
  description: string;
  target: { type: "booking" | "course"; id: string };
}): Promise<{ orderId: string; approveUrl: string }> {
  const token = await getPayPalAccessToken();
  const targetPath =
    input.target.type === "booking"
      ? `/dashboard/bookings/${input.target.id}`
      : `/dashboard/courses/purchases/${input.target.id}`;
  const returnUrl = new URL(
    "/api/v1/payments/paypal/complete",
    env.NEXT_PUBLIC_APP_URL,
  ).toString();
  const cancelUrl = new URL(
    `${targetPath}?payment=cancelled`,
    env.NEXT_PUBLIC_APP_URL,
  ).toString();

  const payload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: input.attemptId,
        description: input.description.slice(0, 127),
        custom_id: input.target.id,
        amount: {
          currency_code: input.currency,
          value: amountFromCents(input.amountCents),
        },
        payee: {
          merchant_id: input.teacherMerchantId,
        },
        payment_instruction: {
          disbursement_mode: "INSTANT",
          platform_fees: [],
        },
      },
    ],
    application_context: {
      brand_name: "Amazing Skills",
      user_action: "PAY_NOW",
      return_url: returnUrl,
      cancel_url: cancelUrl,
      shipping_preference: "NO_SHIPPING",
    },
  };

  const response = await fetch(`${paypalHost()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(env.PAYPAL_BN_CODE ? { "PayPal-Partner-Attribution-Id": env.PAYPAL_BN_CODE } : {}),
      ...(env.PAYPAL_PARTNER_MERCHANT_ID
        ? { "PayPal-Auth-Assertion": "" }
        : {}),
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PayPal order create failed: ${text.slice(0, 240)}`);
  }

  const data = (await response.json()) as {
    id: string;
    links?: Array<{ rel: string; href: string }>;
  };
  const approveUrl =
    data.links?.find((link) => link.rel === "approve")?.href ||
    `${paypalWebHost()}/checkoutnow?token=${data.id}`;

  return { orderId: data.id, approveUrl };
}

type PayPalOrderResult = {
  status: string;
  captureId?: string;
  amount?: string;
  currency?: string;
  payeeMerchantId?: string;
  referenceId?: string;
};

function parsePayPalOrder(data: {
  status: string;
  purchase_units?: Array<{
    reference_id?: string;
    payments?: {
      captures?: Array<{
        id: string;
        amount?: { value: string; currency_code: string };
      }>;
    };
    payee?: { merchant_id?: string };
  }>;
}): PayPalOrderResult {
  const unit = data.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  return {
    status: data.status,
    captureId: capture?.id,
    amount: capture?.amount?.value,
    currency: capture?.amount?.currency_code,
    payeeMerchantId: unit?.payee?.merchant_id,
    referenceId: unit?.reference_id,
  };
}

export async function getPayPalOrder(orderId: string): Promise<PayPalOrderResult> {
  const token = await getPayPalAccessToken();
  const response = await fetch(`${paypalHost()}/v2/checkout/orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(env.PAYPAL_BN_CODE ? { "PayPal-Partner-Attribution-Id": env.PAYPAL_BN_CODE } : {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Unable to verify PayPal order: ${text.slice(0, 240)}`);
  }
  return parsePayPalOrder((await response.json()) as Parameters<typeof parsePayPalOrder>[0]);
}

export async function capturePayPalOrder(orderId: string): Promise<PayPalOrderResult> {
  const token = await getPayPalAccessToken();
  const response = await fetch(`${paypalHost()}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(env.PAYPAL_BN_CODE ? { "PayPal-Partner-Attribution-Id": env.PAYPAL_BN_CODE } : {}),
    },
    body: "{}",
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`PayPal capture failed: ${text.slice(0, 240)}`);
  }
  return parsePayPalOrder((await response.json()) as Parameters<typeof parsePayPalOrder>[0]);
}

export async function verifyPayPalWebhookSignature(input: {
  headers: Headers;
  body: string;
}): Promise<boolean> {
  if (!env.PAYPAL_WEBHOOK_ID) return false;
  const token = await getPayPalAccessToken();
  const response = await fetch(`${paypalHost()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: input.headers.get("paypal-auth-algo"),
      cert_url: input.headers.get("paypal-cert-url"),
      transmission_id: input.headers.get("paypal-transmission-id"),
      transmission_sig: input.headers.get("paypal-transmission-sig"),
      transmission_time: input.headers.get("paypal-transmission-time"),
      webhook_id: env.PAYPAL_WEBHOOK_ID,
      webhook_event: JSON.parse(input.body),
    }),
    cache: "no-store",
  });
  if (!response.ok) return false;
  const data = (await response.json()) as { verification_status?: string };
  return data.verification_status === "SUCCESS";
}
