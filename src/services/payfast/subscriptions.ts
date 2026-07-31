import { createHash } from "node:crypto";

import { env } from "@/lib/env";
import { logger } from "@/lib/observability/logger";

function encode(value: string | number): string {
  return encodeURIComponent(String(value)).replace(/%20/g, "+");
}

type SignedRequest = {
  /** Headers actually sent on the wire. Deliberately excludes the passphrase. */
  headers: Record<string, string>;
};

/**
 * Build the PayFast API headers and signature.
 *
 * SEC-16: the passphrase is signature *salt* only. It was previously placed in the same
 * object used as `fetch` headers, so it was transmitted to api.payfast.co.za on every call
 * and could land in any proxy, edge, or vendor-side request log. It now lives only in the
 * signature payload.
 *
 * `extraFields` are body parameters that must participate in the signature (PayFast signs
 * headers and body together).
 */
function buildSignedRequest(
  extraFields: Record<string, string | number> = {},
): SignedRequest | null {
  if (!env.PAYFAST_MERCHANT_ID || !env.PAYFAST_PASSPHRASE) return null;

  const headers: Record<string, string> = {
    "merchant-id": env.PAYFAST_MERCHANT_ID,
    timestamp: new Date().toISOString().slice(0, 19),
    version: "v1",
  };

  const signaturePayload = [
    ...Object.entries(headers),
    ["passphrase", env.PAYFAST_PASSPHRASE] as [string, string],
    ...Object.entries(extraFields),
  ]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${encode(value)}`)
    .join("&");

  return {
    headers: {
      ...headers,
      signature: createHash("md5").update(signaturePayload).digest("hex"),
    },
  };
}

function readResponseFlag(payload: unknown): boolean {
  const result = payload as { response?: boolean; data?: { response?: boolean } };
  return result?.response === true || result?.data?.response === true;
}

function endpointFor(path: string): URL {
  const endpoint = new URL(path, "https://api.payfast.co.za");
  if (env.PAYFAST_SANDBOX === "true") endpoint.searchParams.set("testing", "true");
  return endpoint;
}

export async function updatePayfastSubscription(input: {
  token: string;
  amountCents: number;
  frequency: 3 | 6;
}): Promise<boolean> {
  // Guard against a zero or negative recurring amount reaching PayFast. run-lifecycle
  // computes this from an optional FX env var with a `?? 0` fallback, so an unset variable
  // would otherwise set a live subscription's recurring charge to R0.00.
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
    logger.error("payfast_subscription_update_invalid_amount", {
      amountCents: input.amountCents,
    });
    return false;
  }

  const body: Record<string, number> = {
    amount: input.amountCents,
    cycles: 0,
    frequency: input.frequency,
  };
  const signed = buildSignedRequest(body);
  if (!signed) return false;

  const form = new URLSearchParams(
    Object.entries(body)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, String(value)]),
  );

  const response = await fetch(
    endpointFor(`/subscriptions/${encodeURIComponent(input.token)}/update`),
    { method: "PATCH", headers: signed.headers, body: form, cache: "no-store" },
  );
  if (!response.ok) return false;
  return readResponseFlag(await response.json());
}

export async function cancelPayfastSubscription(token: string): Promise<boolean> {
  const signed = buildSignedRequest();
  if (!signed) return false;

  const response = await fetch(
    endpointFor(`/subscriptions/${encodeURIComponent(token)}/cancel`),
    { method: "PUT", headers: signed.headers, cache: "no-store" },
  );

  // PayFast returns an error when the subscription is already cancelled (for example after
  // the teacher cancelled on PayFast's side, or PayFast cancelled it after repeated failed
  // charges). Treat that as success: the desired end state -- no active subscription -- is
  // already true. Without this the nightly lifecycle job retries the same cancellation
  // forever and never applies the downgrade, leaving the organization on a paid plan
  // indefinitely while nothing is being charged.
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (/already\s*cancell?ed|not\s*active|inactive/i.test(body)) {
      logger.warn("payfast_subscription_already_cancelled", { token });
      return true;
    }
    logger.warn("payfast_subscription_cancel_failed", { token, status: response.status });
    return false;
  }

  return readResponseFlag(await response.json());
}
