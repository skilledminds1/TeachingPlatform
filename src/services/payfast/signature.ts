/** PayFast operates on South African time; dates sent to it must be computed in this zone. */
export const PAYFAST_TIMEZONE = "Africa/Johannesburg";

import { createHash } from "node:crypto";

function payfastEncode(value: string): string {
  return encodeURIComponent(value.trim())
    .replace(/%20/g, "+")
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/~/g, "%7E");
}

export function createPayfastSignature(
  fields: Iterable<[string, string]>,
  passphrase?: string,
): string {
  const pairs: string[] = [];
  for (const [key, value] of fields) {
    if (key !== "signature" && value !== "") {
      pairs.push(`${key}=${payfastEncode(value)}`);
    }
  }
  if (passphrase) {
    pairs.push(`passphrase=${payfastEncode(passphrase)}`);
  }
  return createHash("md5").update(pairs.join("&")).digest("hex");
}
