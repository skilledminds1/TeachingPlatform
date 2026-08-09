import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  PADDLE_SIGNATURE_TOLERANCE_SECONDS,
  parsePaddleSignature,
  verifyPaddleSignature,
} from "./signature";

/**
 * The webhook signature is the entire security boundary for Paddle (PAY-03).
 *
 * PayFast's ITN had a second line of defence: the handler called PayFast back and asked
 * whether the notification was real. Paddle has no equivalent, so anything that gets past this
 * function mutates billing state on the strength of a POST body alone — and a route that can
 * be made to believe in a subscription is a route that grants paid plans for free.
 */
const SECRET = "pdl_ntfset_test_secret";
const BODY = JSON.stringify({ event_type: "subscription.created", data: { id: "sub_1" } });

function sign(body: string, timestamp: number, secret = SECRET): string {
  const hash = createHmac("sha256", secret).update(`${timestamp}:${body}`).digest("hex");
  return `ts=${timestamp};h1=${hash}`;
}

const NOW = new Date("2026-08-09T12:00:00.000Z");
const nowSeconds = Math.floor(NOW.getTime() / 1000);

describe("parsing the Paddle-Signature header", () => {
  it("reads ts and h1", () => {
    expect(parsePaddleSignature("ts=1696516480;h1=abc123")).toEqual({
      timestamp: "1696516480",
      hash: "abc123",
    });
  });

  /** A hostile header must not become a 500 that reads like our bug. */
  it("returns null for anything malformed rather than throwing", () => {
    for (const header of [null, "", "garbage", "ts=;h1=", "h1=abc123", "ts=1696516480"]) {
      expect(parsePaddleSignature(header), `header: ${String(header)}`).toBeNull();
    }
  });

  /** A non-numeric ts would sail into the age arithmetic and come out NaN. */
  it("refuses a non-numeric timestamp", () => {
    expect(parsePaddleSignature("ts=not-a-number;h1=abc123")).toBeNull();
  });

  /**
   * Only h1 is defined. An unknown version must fail closed rather than be verified with the
   * wrong algorithm and pass.
   */
  it("ignores a signature version it does not know", () => {
    expect(parsePaddleSignature("ts=1696516480;h2=abc123")).toBeNull();
  });
});

describe("verifying a notification", () => {
  it("accepts a correctly signed body", () => {
    const result = verifyPaddleSignature({
      rawBody: BODY,
      signatureHeader: sign(BODY, nowSeconds),
      secret: SECRET,
      now: NOW,
    });
    expect(result).toEqual({ ok: true });
  });

  /**
   * The single most valuable assertion here. An unset secret meaning "skip the check" turns a
   * deploy with a missing variable into an open endpoint that grants paid plans to anyone who
   * finds the URL.
   */
  it("fails closed when no secret is configured", () => {
    expect(
      verifyPaddleSignature({
        rawBody: BODY,
        signatureHeader: sign(BODY, nowSeconds),
        secret: undefined,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "missing_secret" });
  });

  it("refuses a body that does not match its signature", () => {
    const tampered = JSON.stringify({ event_type: "subscription.created", data: { id: "sub_2" } });
    expect(
      verifyPaddleSignature({
        rawBody: tampered,
        signatureHeader: sign(BODY, nowSeconds),
        secret: SECRET,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("refuses a signature made with a different secret", () => {
    expect(
      verifyPaddleSignature({
        rawBody: BODY,
        signatureHeader: sign(BODY, nowSeconds, "someone-elses-secret"),
        secret: SECRET,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "bad_signature" });
  });

  /**
   * Without a tolerance a captured notification stays valid for ever, and every replay of a
   * transaction.completed writes another invoice.
   */
  it("refuses a signature older than the tolerance", () => {
    const stale = nowSeconds - PADDLE_SIGNATURE_TOLERANCE_SECONDS - 1;
    expect(
      verifyPaddleSignature({
        rawBody: BODY,
        signatureHeader: sign(BODY, stale),
        secret: SECRET,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "stale_timestamp" });
  });

  it("allows ordinary clock skew inside the tolerance", () => {
    const slightlyOld = nowSeconds - (PADDLE_SIGNATURE_TOLERANCE_SECONDS - 30);
    expect(
      verifyPaddleSignature({
        rawBody: BODY,
        signatureHeader: sign(BODY, slightlyOld),
        secret: SECRET,
        now: NOW,
      }),
    ).toEqual({ ok: true });
  });

  /** A clock ahead of ours is skew too, not an attack. */
  it("tolerates a timestamp slightly in the future", () => {
    const slightlyAhead = nowSeconds + 30;
    expect(
      verifyPaddleSignature({
        rawBody: BODY,
        signatureHeader: sign(BODY, slightlyAhead),
        secret: SECRET,
        now: NOW,
      }),
    ).toEqual({ ok: true });
  });

  it("refuses a missing header", () => {
    expect(
      verifyPaddleSignature({
        rawBody: BODY,
        signatureHeader: null,
        secret: SECRET,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "missing_signature" });
  });

  /**
   * A hash of the wrong length must be a plain rejection. timingSafeEqual throws on unequal
   * buffers, which would leak length through an exception and 500 on a malformed request.
   */
  it("refuses a truncated hash without throwing", () => {
    expect(
      verifyPaddleSignature({
        rawBody: BODY,
        signatureHeader: `ts=${nowSeconds};h1=abcd`,
        secret: SECRET,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "bad_signature" });
  });

  /**
   * The body must be verified byte-for-byte as received. Re-serialising parsed JSON reorders
   * keys, the HMAC stops matching, and every legitimate notification is refused — a failure
   * that looks exactly like a wrong secret.
   */
  it("is sensitive to whitespace, so the raw body must be used", () => {
    const reserialised = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(
      verifyPaddleSignature({
        rawBody: reserialised,
        signatureHeader: sign(BODY, nowSeconds),
        secret: SECRET,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: "bad_signature" });
  });
});
