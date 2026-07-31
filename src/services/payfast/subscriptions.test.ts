import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    PAYFAST_MERCHANT_ID: "10000100",
    PAYFAST_PASSPHRASE: "test-passphrase",
    PAYFAST_SANDBOX: "true",
  },
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const { cancelPayfastSubscription, updatePayfastSubscription } = await import(
  "./subscriptions"
);

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function textResponse(body: string, ok = false, status = 400) {
  return {
    ok,
    status,
    json: async () => JSON.parse(body),
    text: async () => body,
  } as unknown as Response;
}

describe("updatePayfastSubscription", () => {
  it("never transmits the passphrase", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ response: true }));
    await updatePayfastSubscription({ token: "tok", amountCents: 52900, frequency: 3 });

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("passphrase");
    expect(JSON.stringify(headers)).not.toContain("test-passphrase");
    expect(headers.signature).toMatch(/^[a-f0-9]{32}$/);
    expect(headers["merchant-id"]).toBe("10000100");
  });

  // run-lifecycle derived this amount from an optional FX env var with a `?? 0` fallback.
  // Reaching PayFast with 0 would set a live subscription's recurring charge to R0.00.
  it("refuses a zero or negative recurring amount without calling PayFast", async () => {
    for (const amountCents of [0, -1, Number.NaN]) {
      expect(
        await updatePayfastSubscription({ token: "tok", amountCents, frequency: 3 }),
      ).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports success only when PayFast confirms", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ response: true }));
    expect(
      await updatePayfastSubscription({ token: "tok", amountCents: 100, frequency: 3 }),
    ).toBe(true);

    fetchMock.mockResolvedValue(jsonResponse({ response: false }));
    expect(
      await updatePayfastSubscription({ token: "tok", amountCents: 100, frequency: 3 }),
    ).toBe(false);
  });
});

describe("cancelPayfastSubscription", () => {
  it("never transmits the passphrase", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ response: true }));
    await cancelPayfastSubscription("tok");

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("passphrase");
    expect(JSON.stringify(headers)).not.toContain("test-passphrase");
  });

  // The lifecycle job requires this to succeed before downgrading. Treating an
  // already-cancelled subscription as a failure made the job retry forever, leaving the
  // organization on a paid plan indefinitely while nothing was charged.
  it("treats an already-cancelled subscription as success", async () => {
    fetchMock.mockResolvedValue(
      textResponse('{"message":"Subscription is already cancelled"}'),
    );
    expect(await cancelPayfastSubscription("tok")).toBe(true);
  });

  it("still reports failure for a genuine error", async () => {
    fetchMock.mockResolvedValue(textResponse('{"message":"Internal server error"}', false, 500));
    expect(await cancelPayfastSubscription("tok")).toBe(false);
  });
});
