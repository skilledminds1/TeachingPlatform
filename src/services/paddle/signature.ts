import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verification for Paddle webhook notifications (PAY-03).
 *
 * Paddle signs every notification with an HMAC-SHA256 over `timestamp:rawBody`, keyed by the
 * notification setting's secret, and sends it in a `Paddle-Signature` header shaped:
 *
 *   ts=1696516480;h1=8a4e6c...
 *
 * This is the whole security boundary. A webhook route is a public endpoint that mutates
 * billing state, so anything that reaches it unverified can grant a paid plan for free by
 * POSTing a plausible JSON body. PayFast's ITN had a second line of defence — a server-side
 * confirmation call back to PayFast — and Paddle has no equivalent, which makes getting this
 * right load-bearing rather than merely good practice.
 */

export type PaddleSignatureParts = { timestamp: string; hash: string };

/**
 * Pull `ts` and `h1` out of the header.
 *
 * Returns null rather than throwing on anything malformed: a caller that has to distinguish
 * "absent" from "present but unparseable" will treat both as unauthorised anyway, and an
 * exception here would turn a hostile header into a 500 that looks like our bug.
 */
export function parsePaddleSignature(header: string | null): PaddleSignatureParts | null {
  if (!header) return null;

  let timestamp: string | null = null;
  let hash: string | null = null;

  for (const segment of header.split(";")) {
    const separator = segment.indexOf("=");
    if (separator <= 0) continue;
    const key = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if (key === "ts") timestamp = value;
    // Only h1 is defined today. An unknown version is ignored rather than guessed at, so a
    // future h2 fails closed here instead of being verified with the wrong algorithm.
    else if (key === "h1") hash = value;
  }

  if (!timestamp || !hash) return null;
  if (!/^\d+$/.test(timestamp)) return null;
  return { timestamp, hash };
}

/** Constant-time compare of two hex digests, false on any length or encoding mismatch. */
function hashesMatch(expected: string, received: string): boolean {
  // timingSafeEqual throws on unequal lengths, which would leak length through an exception
  // and turn a malformed signature into a 500.
  if (expected.length !== received.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    return false;
  }
}

/**
 * How far out of step a notification's timestamp may be before it is refused.
 *
 * Without this, a signature stays valid for ever and a notification captured once can be
 * replayed indefinitely — every replay of a `transaction.completed` writing another invoice.
 * Five minutes absorbs ordinary clock skew and Paddle's own retry delay without leaving a
 * usable window.
 */
export const PADDLE_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export type PaddleVerificationFailure =
  | "missing_secret"
  | "missing_signature"
  | "stale_timestamp"
  | "bad_signature";

export type PaddleVerificationResult =
  | { ok: true }
  | { ok: false; reason: PaddleVerificationFailure };

/**
 * Verify a raw request body against the Paddle-Signature header.
 *
 * MUST be given the RAW body exactly as received. Re-serialising parsed JSON changes key
 * order and whitespace, the HMAC no longer matches, and every legitimate notification is
 * rejected — a failure that looks like a wrong secret and is not.
 */
export function verifyPaddleSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string | undefined;
  now?: Date;
}): PaddleVerificationResult {
  // Fail closed. An unset secret must never mean "skip the check": that turns a deploy with a
  // missing variable into an open endpoint that grants paid plans to anyone who finds it.
  if (!input.secret) return { ok: false, reason: "missing_secret" };

  const parts = parsePaddleSignature(input.signatureHeader);
  if (!parts) return { ok: false, reason: "missing_signature" };

  const now = input.now ?? new Date();
  const ageSeconds = Math.abs(now.getTime() / 1000 - Number(parts.timestamp));
  if (ageSeconds > PADDLE_SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const expected = createHmac("sha256", input.secret)
    .update(`${parts.timestamp}:${input.rawBody}`)
    .digest("hex");

  return hashesMatch(expected, parts.hash) ? { ok: true } : { ok: false, reason: "bad_signature" };
}
