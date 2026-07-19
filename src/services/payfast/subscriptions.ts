import { createHash } from "node:crypto";

import { env } from "@/lib/env";

function encode(value: string | number): string {
  return encodeURIComponent(String(value)).replace(/%20/g, "+");
}

function buildSignedHeaders(): Record<string, string> | null {
  if (!env.PAYFAST_MERCHANT_ID || !env.PAYFAST_PASSPHRASE) return null;
  const timestamp = new Date().toISOString().slice(0, 19);
  const headers: Record<string, string> = {
    "merchant-id": env.PAYFAST_MERCHANT_ID,
    passphrase: env.PAYFAST_PASSPHRASE,
    timestamp,
    version: "v1",
  };
  const signaturePayload = Object.entries(headers)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${encode(value)}`)
    .join("&");
  headers.signature = createHash("md5").update(signaturePayload).digest("hex");
  return headers;
}

export async function updatePayfastSubscription(input: {
  token: string;
  amountCents: number;
  frequency: 3 | 6;
}): Promise<boolean> {
  if (!env.PAYFAST_MERCHANT_ID || !env.PAYFAST_PASSPHRASE) return false;

  const timestamp = new Date().toISOString().slice(0, 19);
  const headers: Record<string, string> = {
    "merchant-id": env.PAYFAST_MERCHANT_ID,
    passphrase: env.PAYFAST_PASSPHRASE,
    timestamp,
    version: "v1",
  };
  const body: Record<string, number> = {
    amount: input.amountCents,
    cycles: 0,
    frequency: input.frequency,
  };
  const signaturePayload = [...Object.entries(headers), ...Object.entries(body)]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${encode(value)}`)
    .join("&");
  headers.signature = createHash("md5").update(signaturePayload).digest("hex");

  const endpoint = new URL(
    `/subscriptions/${encodeURIComponent(input.token)}/update`,
    "https://api.payfast.co.za",
  );
  if (env.PAYFAST_SANDBOX === "true") endpoint.searchParams.set("testing", "true");

  const form = new URLSearchParams(
    Object.entries(body)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, String(value)]),
  );
  const response = await fetch(endpoint, {
    method: "PATCH",
    headers,
    body: form,
    cache: "no-store",
  });
  if (!response.ok) return false;

  const result = (await response.json()) as {
    response?: boolean;
    data?: { response?: boolean };
  };
  return result.response === true || result.data?.response === true;
}

export async function cancelPayfastSubscription(token: string): Promise<boolean> {
  const headers = buildSignedHeaders();
  if (!headers) return false;

  const endpoint = new URL(
    `/subscriptions/${encodeURIComponent(token)}/cancel`,
    "https://api.payfast.co.za",
  );
  if (env.PAYFAST_SANDBOX === "true") endpoint.searchParams.set("testing", "true");

  const response = await fetch(endpoint, {
    method: "PUT",
    headers,
    cache: "no-store",
  });
  if (!response.ok) return false;

  const result = (await response.json()) as {
    response?: boolean;
    data?: { response?: boolean };
  };
  return result.response === true || result.data?.response === true;
}
