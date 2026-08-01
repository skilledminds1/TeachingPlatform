import { createHash } from "node:crypto";

/** PayFast operates on South African time; dates sent to it must be computed in this zone. */
export const PAYFAST_TIMEZONE = "Africa/Johannesburg";

function payfastEncode(value: string): string {
  return encodeURIComponent(value.trim())
    .replace(/%20/g, "+")
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/~/g, "%7E");
}

/**
 * Build a PayFast MD5 signature over the given fields, in the order supplied.
 *
 * `includeEmpty` controls whether blank values participate. PayFast's documented procedure
 * for GENERATING a checkout signature omits them, which is the default here.
 */
export function createPayfastSignature(
  fields: Iterable<[string, string]>,
  passphrase?: string,
  options: { includeEmpty?: boolean } = {},
): string {
  const pairs: string[] = [];
  for (const [key, value] of fields) {
    if (key === "signature") continue;
    if (!options.includeEmpty && value === "") continue;
    pairs.push(`${key}=${payfastEncode(value)}`);
  }
  if (passphrase) {
    pairs.push(`passphrase=${payfastEncode(passphrase)}`);
  }
  return createHash("md5").update(pairs.join("&")).digest("hex");
}

/**
 * Verify an ITN signature.
 *
 * MON-18: the checkout-generation rule (omit empty values) was being reused to verify
 * incoming notifications, but PayFast's published ITN sample builds its parameter string
 * from *every* posted field except `signature`, without filtering blanks — and real ITN
 * payloads routinely contain empty fields (unused custom_str slots, an absent name_last).
 * If PayFast includes them, the filtered form would mismatch and EVERY legitimate ITN would
 * be rejected, so no subscription would ever activate.
 *
 * Which form PayFast actually uses cannot be settled from the documentation, and guessing
 * risks breaking a path that may currently work. Rather than pick one blind, accept a match
 * against either canonicalisation. This costs nothing in security: both require the shared
 * passphrase, so an attacker who can produce either has the secret already. It also makes
 * the outcome independent of a detail we cannot observe until a real ITN arrives.
 *
 * `compare` is injected so the caller supplies its constant-time comparison.
 */
export function verifyPayfastItnSignature(input: {
  fields: Iterable<[string, string]>;
  received: string;
  passphrase: string;
  compare: (a: string, b: string) => boolean;
}): boolean {
  // The iterable may be single-pass, so materialise it before hashing twice.
  const fields = [...input.fields];

  return (
    input.compare(input.received, createPayfastSignature(fields, input.passphrase)) ||
    input.compare(
      input.received,
      createPayfastSignature(fields, input.passphrase, { includeEmpty: true }),
    )
  );
}
