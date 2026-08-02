import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integration tests for the subscription notification handler's state machine.
 *
 * Scope note (QLT-02): what is tested here are *subscription-lifecycle invariants* — which
 * facts a renewal is allowed to overwrite, replay idempotency, grace transitions, and the
 * rule that a paid period is never extended or invoiced twice. Those hold for any provider,
 * so they survive PAY-05 decommissioning the PayFast rail.
 *
 * PayFast's wire format is deliberately NOT tested here: signature verification is mocked
 * out (src/services/payfast/signature.test.ts owns the param-string construction), and the
 * FX rate is left unset so the amount cross-check reduces to "the payment must be positive"
 * rather than a ZAR conversion. Those genuinely die with the rail.
 *
 * The transaction mock buffers writes and discards them unless the callback resolves, so
 * "a duplicate notification changes nothing" is asserted against committed state.
 */

type AnyRecord = Record<string, unknown>;
type Write = { model: string; op: string; args: AnyRecord };

const MERCHANT_ID = "10000100";
const NOW = new Date("2026-07-19T12:00:00.000Z");

const state = {
  signatureValid: true,
  validation: { ok: true, body: "VALID" },
  organization: null as AnyRecord | null,
  plan: { id: "plan-starter", name: "Starter" } as AnyRecord | null,
  /** Writes that survived the transaction. */
  writes: [] as Write[],
  /** billingEvent.create calls made outside the transaction (the rejected-payment audit). */
  auditWrites: [] as AnyRecord[],
  /** Set to make the deduplicating insert fail the way a replayed notification would. */
  billingEventError: null as unknown,
  /** `where` clauses the handler looked plans up by. */
  planLookups: [] as AnyRecord[],
};

const loggerInfo = vi.fn();
const loggerError = vi.fn();

vi.mock("@/lib/db", () => {
  const makeTx = (pending: Write[]) => ({
    billingEvent: {
      create: vi.fn(async (args: AnyRecord) => {
        if (state.billingEventError) throw state.billingEventError;
        pending.push({ model: "billingEvent", op: "create", args });
        return { id: "evt-row-1" };
      }),
    },
    organization: {
      update: vi.fn(async (args: AnyRecord) => {
        pending.push({ model: "organization", op: "update", args });
        return {};
      }),
    },
    subscriptionInvoice: {
      create: vi.fn(async (args: AnyRecord) => {
        pending.push({ model: "subscriptionInvoice", op: "create", args });
        return {};
      }),
    },
  });

  return {
    db: {
      $transaction: async (fn: (tx: ReturnType<typeof makeTx>) => Promise<unknown>) => {
        const pending: Write[] = [];
        const result = await fn(makeTx(pending));
        state.writes.push(...pending);
        return result;
      },
      organization: { findUnique: vi.fn(async () => state.organization) },
      plan: {
        findUnique: vi.fn(async (args: { where: AnyRecord }) => {
          state.planLookups.push(args.where);
          return state.plan;
        }),
      },
      billingEvent: {
        create: vi.fn(async (args: AnyRecord) => {
          state.auditWrites.push(args);
          return {};
        }),
      },
    },
  };
});

vi.mock("@/lib/env", () => ({
  env: {
    PAYFAST_MERCHANT_ID: MERCHANT_ID,
    PAYFAST_PASSPHRASE: "test-passphrase",
    PAYFAST_SANDBOX: "true",
    // Left unset on purpose: the ZAR cross-check is wire format that dies with the rail.
    // Without a rate the handler only insists the payment was positive, which is the part
    // of the check that is really an invariant.
    PAYFAST_USD_ZAR_RATE: undefined,
  },
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: {
    info: (...args: unknown[]) => loggerInfo(...args),
    error: (...args: unknown[]) => loggerError(...args),
    warn: vi.fn(),
  },
}));

vi.mock("@/services/payfast/signature", () => ({
  verifyPayfastItnSignature: vi.fn(() => state.signatureValid),
}));

const { POST } = await import("./route");

function organization(overrides: AnyRecord = {}): AnyRecord {
  return {
    id: "org-1",
    currentPeriodEnd: null,
    graceStartedAt: null,
    graceEndsAt: null,
    payfastToken: null,
    planId: "plan-starter",
    billingInterval: "monthly",
    ...overrides,
  };
}

function itn(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    merchant_id: MERCHANT_ID,
    signature: "deadbeef",
    pf_payment_id: "evt-1",
    payment_status: "COMPLETE",
    amount_gross: "539.00",
    token: "tok-1",
    custom_str1: "org-1",
    custom_str2: "plan-starter",
    custom_str3: "monthly",
    ...overrides,
  };
}

async function post(fields: Record<string, string>) {
  const request = new Request("https://app.example.com/api/v1/webhooks/payfast", {
    method: "POST",
    body: new URLSearchParams(fields).toString(),
  }) as unknown as NextRequest;
  const response = await POST(request);
  return { status: response.status, body: await response.text() };
}

const written = (model: string, op: string) =>
  state.writes.filter((write) => write.model === model && write.op === op).map((w) => w.args);

/** The data payload of the single committed organization update. */
function orgUpdate(): AnyRecord {
  const updates = written("organization", "update");
  expect(updates).toHaveLength(1);
  return (updates[0] as { data: AnyRecord }).data;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  state.signatureValid = true;
  state.validation = { ok: true, body: "VALID" };
  state.organization = organization();
  state.plan = { id: "plan-starter", name: "Starter" };
  state.writes = [];
  state.auditWrites = [];
  state.billingEventError = null;
  state.planLookups = [];
  loggerInfo.mockClear();
  loggerError.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: state.validation.ok,
      text: async () => state.validation.body,
    })),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("rejected notifications never reach billing state", () => {
  it("refuses an unverified signature", async () => {
    state.signatureValid = false;

    expect(await post(itn())).toMatchObject({ status: 400 });
    expect(state.writes).toHaveLength(0);
  });

  it("refuses a notification for another merchant", async () => {
    expect(await post(itn({ merchant_id: "99999999" }))).toMatchObject({ status: 400 });
    expect(state.writes).toHaveLength(0);
  });

  // The signature proves the payload was not tampered with; only the server postback proves
  // it came from the provider at all. Neither may be skipped before touching money.
  it("refuses a payload the provider will not confirm", async () => {
    state.validation = { ok: true, body: "INVALID" };

    expect(await post(itn())).toMatchObject({ status: 400 });
    expect(state.writes).toHaveLength(0);
  });

  it("refuses a notification missing its billing metadata", async () => {
    for (const missing of ["custom_str1", "custom_str2", "pf_payment_id", "payment_status"]) {
      const fields = itn();
      delete fields[missing];
      expect(await post(fields)).toMatchObject({ status: 400 });
    }
    expect(await post(itn({ custom_str3: "weekly" }))).toMatchObject({ status: 400 });
    expect(state.writes).toHaveLength(0);
  });

  it("refuses a notification for an unknown organization or plan", async () => {
    state.organization = null;
    expect(await post(itn())).toMatchObject({ status: 404 });

    state.organization = organization();
    state.plan = null;
    expect(await post(itn())).toMatchObject({ status: 404 });

    expect(state.writes).toHaveLength(0);
  });

  // A subscription must never be activated off a zero-value payment. The rejection is still
  // recorded, so a genuine misconfiguration is visible rather than silently dropped.
  it("refuses a completed payment carrying no money but keeps an audit row", async () => {
    const response = await post(itn({ amount_gross: "0" }));

    expect(response.status).toBe(400);
    expect(state.writes).toHaveLength(0);
    expect(state.auditWrites).toHaveLength(1);
    expect(state.auditWrites[0]).toMatchObject({
      data: expect.objectContaining({
        organizationId: "org-1",
        providerEventId: "evt-1:amount_mismatch",
        eventType: "validation_failed",
      }),
    });
    expect(loggerError).toHaveBeenCalledWith(
      "payfast_itn_amount_mismatch",
      expect.objectContaining({ organizationId: "org-1" }),
    );
  });

  it("ignores legacy lesson notifications without touching subscriptions", async () => {
    expect(await post(itn({ custom_str1: "lesson" }))).toMatchObject({ status: 200 });
    expect(state.writes).toHaveLength(0);
  });
});

describe("first activation of a subscription", () => {
  it("takes the plan and interval from the notification and starts the period", async () => {
    state.organization = organization({ planId: "plan-free", billingInterval: "monthly" });
    state.plan = { id: "plan-business", name: "Business" };

    const response = await post(
      itn({ custom_str2: "plan-business", custom_str3: "annual", token: "tok-new" }),
    );

    expect(response.status).toBe(200);
    expect(orgUpdate()).toMatchObject({
      planId: "plan-business",
      billingInterval: "annual",
      subscriptionStatus: "active",
      payfastToken: "tok-new",
      currentPeriodEnd: new Date("2027-07-19T12:00:00.000Z"),
      cancelAtPeriodEnd: false,
    });
  });

  // A teacher who cancelled and later checked out again arrives on a different mandate, so
  // the notification's fields are authoritative once more.
  it("treats a different mandate as a fresh activation", async () => {
    state.organization = organization({ payfastToken: "tok-old", planId: "plan-starter" });
    state.plan = { id: "plan-business", name: "Business" };

    await post(itn({ token: "tok-new", custom_str2: "plan-business", custom_str3: "annual" }));

    expect(orgUpdate()).toMatchObject({
      planId: "plan-business",
      billingInterval: "annual",
      payfastToken: "tok-new",
    });
  });
});

describe("renewal of an existing subscription", () => {
  // MON-12. The provider echoes the ORIGINAL checkout's custom fields on every recurring
  // charge for the life of a mandate, while plans are changed in place on that same mandate.
  // Applying them on every notification charged an upgraded teacher the Business amount and
  // then silently reset them to Starter; every cron-applied scheduled downgrade was reverted
  // at the next renewal. The invariant: a renewal may extend the period, and nothing else.
  it("keeps the plan the organization is actually on and only extends the period", async () => {
    state.organization = organization({
      payfastToken: "tok-1",
      planId: "plan-business",
      billingInterval: "annual",
      currentPeriodEnd: new Date("2026-08-15T00:00:00.000Z"),
    });
    state.plan = { id: "plan-business", name: "Business" };

    // Stale echoes of the original Starter monthly checkout.
    await post(itn({ token: "tok-1", custom_str2: "plan-starter", custom_str3: "monthly" }));

    const data = orgUpdate();
    expect(data.planId).toBe("plan-business");
    expect(data.billingInterval).toBe("annual");
    expect(data.currentPeriodEnd).toEqual(new Date("2027-08-15T00:00:00.000Z"));
    // The plan is also resolved from the organization, so the invoice is described with the
    // plan that was actually charged rather than the one bought at first checkout.
    expect(state.planLookups).toEqual([{ id: "plan-business" }]);
    expect(loggerInfo).toHaveBeenCalledWith(
      "payfast_itn_stale_custom_fields_ignored",
      expect.objectContaining({ itnPlanId: "plan-starter", currentPlanId: "plan-business" }),
    );
  });

  it("extends from the end of the paid period rather than from the payment date", async () => {
    state.organization = organization({
      payfastToken: "tok-1",
      currentPeriodEnd: new Date("2026-08-15T00:00:00.000Z"),
    });

    await post(itn());

    expect(orgUpdate().currentPeriodEnd).toEqual(new Date("2026-09-15T00:00:00.000Z"));
  });

  it("extends from the payment date once the previous period has lapsed", async () => {
    state.organization = organization({
      payfastToken: "tok-1",
      currentPeriodEnd: new Date("2026-06-01T00:00:00.000Z"),
    });

    await post(itn());

    expect(orgUpdate().currentPeriodEnd).toEqual(new Date("2026-08-19T12:00:00.000Z"));
  });

  // A verified payment is the only thing allowed to clear past-due state — MON-15 closed the
  // token-update path that cleared it without any money moving.
  it("clears grace, dunning and complimentary state", async () => {
    state.organization = organization({
      payfastToken: "tok-1",
      graceStartedAt: new Date("2026-07-10T00:00:00.000Z"),
      graceEndsAt: new Date("2026-07-24T00:00:00.000Z"),
    });

    await post(itn());

    expect(orgUpdate()).toMatchObject({
      subscriptionStatus: "active",
      graceStartedAt: null,
      graceEndsAt: null,
      dunningStage: 0,
      dunningLastNoticeAt: null,
      trialEndsAt: null,
      pendingPlanId: null,
      pendingBillingInterval: null,
      pendingChangeAt: null,
      complimentaryPlanId: null,
      complimentaryExpiresAt: null,
    });
  });

  it("raises exactly one invoice for the period it just paid for", async () => {
    state.organization = organization({
      payfastToken: "tok-1",
      currentPeriodEnd: new Date("2026-08-15T00:00:00.000Z"),
    });

    await post(itn({ amount_gross: "539.00" }));

    const invoices = written("subscriptionInvoice", "create");
    expect(invoices).toHaveLength(1);
    expect((invoices[0] as { data: AnyRecord }).data).toMatchObject({
      organizationId: "org-1",
      billingEventId: "evt-row-1",
      providerPaymentId: "evt-1",
      amountCents: 53900,
      periodStart: NOW,
      periodEnd: new Date("2026-09-15T00:00:00.000Z"),
    });
  });

  // The deduplicating row and the state change have to land together, or a replay could
  // apply the state change while the row that would have blocked it is missing.
  it("records the event in the same transaction as the state change", async () => {
    await post(itn());

    expect(state.writes.map((write) => `${write.model}.${write.op}`)).toEqual([
      "billingEvent.create",
      "organization.update",
      "subscriptionInvoice.create",
    ]);
  });
});

describe("duplicate delivery", () => {
  // Providers redeliver on any non-200, so the same payment arrives more than once as a
  // matter of course. The unique provider event id must make the second delivery a no-op:
  // no second period extension, no second invoice, and a 200 so redelivery stops.
  it("acknowledges a replayed notification without repeating any of its effects", async () => {
    state.organization = organization({
      payfastToken: "tok-1",
      currentPeriodEnd: new Date("2026-08-15T00:00:00.000Z"),
    });
    state.billingEventError = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "6",
    });

    const response = await post(itn());

    expect(response).toMatchObject({ status: 200, body: "OK" });
    expect(state.writes).toHaveLength(0);
  });

  it("is idempotent for a failed payment too", async () => {
    state.organization = organization({ payfastToken: "tok-1" });
    state.billingEventError = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "6",
    });

    expect(await post(itn({ payment_status: "FAILED" }))).toMatchObject({ status: 200 });
    expect(state.writes).toHaveLength(0);
  });

  // Anything that is not a duplicate must surface as a non-200 so the provider retries.
  // Swallowing it would drop a real payment on the floor.
  it("does not swallow a genuine write failure", async () => {
    state.billingEventError = new Error("connection reset");

    await expect(post(itn())).rejects.toThrow("connection reset");
    expect(state.writes).toHaveLength(0);
  });
});

describe("failed payment", () => {
  it("starts a fourteen-day grace period and keeps access", async () => {
    state.organization = organization({ payfastToken: "tok-1", planId: "plan-business" });

    const response = await post(itn({ payment_status: "FAILED" }));

    expect(response.status).toBe(200);
    const data = orgUpdate();
    expect(data).toMatchObject({
      subscriptionStatus: "past_due",
      graceStartedAt: NOW,
      graceEndsAt: new Date("2026-08-02T12:00:00.000Z"),
      dunningStage: 0,
    });
    // Paid access continues through grace, and the mandate stays live so a retry can settle.
    expect(data).not.toHaveProperty("planId");
    expect(data).not.toHaveProperty("payfastToken");
  });

  // Otherwise each retry of a dying card restarts the fourteen days and the subscription
  // never actually lapses — an unbounded free ride on a payment method that cannot pay.
  it("preserves the original window when grace is already running", async () => {
    const startedAt = new Date("2026-07-10T00:00:00.000Z");
    const endsAt = new Date("2026-07-24T00:00:00.000Z");
    state.organization = organization({
      payfastToken: "tok-1",
      graceStartedAt: startedAt,
      graceEndsAt: endsAt,
    });

    await post(itn({ payment_status: "FAILED", pf_payment_id: "evt-2" }));

    expect(orgUpdate()).toEqual({
      subscriptionStatus: "past_due",
      graceStartedAt: startedAt,
      graceEndsAt: endsAt,
    });
  });

  it("raises no invoice", async () => {
    await post(itn({ payment_status: "FAILED" }));

    expect(written("subscriptionInvoice", "create")).toHaveLength(0);
  });
});

describe("cancelled subscription", () => {
  // MON-13. Keeping the mandate meant the nightly job tried to cancel an already-cancelled
  // subscription every night, failed every night, and left the organization on a paid plan
  // indefinitely while nothing was being charged. Clearing it lets the job's no-mandate
  // short-circuit apply the downgrade at period end.
  it("retires the mandate and schedules the downgrade for period end", async () => {
    state.organization = organization({
      payfastToken: "tok-1",
      currentPeriodEnd: new Date("2026-08-15T00:00:00.000Z"),
    });

    const response = await post(itn({ payment_status: "CANCELLED" }));

    expect(response.status).toBe(200);
    expect(orgUpdate()).toEqual({ cancelAtPeriodEnd: true, payfastToken: null });
  });

  // The period is already paid for; revoking it here would take away access the teacher
  // bought. The lifecycle job downgrades when currentPeriodEnd passes.
  it("does not revoke the paid period or raise an invoice", async () => {
    state.organization = organization({ payfastToken: "tok-1" });

    await post(itn({ payment_status: "CANCELLED" }));

    const data = orgUpdate();
    expect(data).not.toHaveProperty("planId");
    expect(data).not.toHaveProperty("currentPeriodEnd");
    expect(written("subscriptionInvoice", "create")).toHaveLength(0);
  });
});

// Recording it keeps the audit trail complete and the dedupe row in place, while an unknown
// status is never allowed to guess at a state transition.
it("records an unrecognised status without changing any state", async () => {
  const response = await post(itn({ payment_status: "PENDING" }));

  expect(response.status).toBe(200);
  expect(written("billingEvent", "create")).toHaveLength(1);
  expect(written("organization", "update")).toHaveLength(0);
  expect(written("subscriptionInvoice", "create")).toHaveLength(0);
});
