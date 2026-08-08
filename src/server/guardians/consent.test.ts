import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Guardian consent — the gate that decides whether a child can be put in a video room with an
 * adult. The assertions that matter are the negative ones: which states must NOT allow a
 * booking, and which token replays must NOT grant consent twice.
 */

type AnyRecord = Record<string, unknown>;

const state = {
  consent: null as AnyRecord | null,
  updateManyResult: { count: 1 },
  writes: { updateMany: [] as AnyRecord[], consentRecords: [] as AnyRecord[] },
};

const tx = {
  guardianConsent: {
    findUnique: vi.fn(async () => state.consent),
    updateMany: vi.fn(async (args: AnyRecord) => {
      state.writes.updateMany.push(args);
      return state.updateManyResult;
    }),
  },
  consentRecord: {
    create: vi.fn(async (args: AnyRecord) => {
      state.writes.consentRecords.push(args);
      return {};
    }),
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
};

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    guardianConsent: {
      findUnique: vi.fn(async () => state.consent),
      upsert: vi.fn(async () => ({})),
    },
  },
}));
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_APP_URL: "https://app.example.com", LEGAL_EVIDENCE_SALT: "salt" },
}));
vi.mock("@/lib/legal/documents", () => ({
  CURRENT_LEGAL_DOCUMENTS: { privacy: { version: "3.0" } },
}));
vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
const enqueueEmailMock = vi.fn(async () => ({ enqueued: true }));
vi.mock("@/server/notifications/email-outbox", () => ({
  enqueueEmail: (...args: unknown[]) => enqueueEmailMock(...(args as [])),
}));
vi.mock("@/services/email/templates", () => ({
  renderEmailTemplate: () => "<html></html>",
}));

const { verifyGuardianConsent, guardianBookingEligibility } = await import("./consent");

const FUTURE = new Date(Date.now() + 86_400_000);
const PAST = new Date(Date.now() - 86_400_000);

beforeEach(() => {
  state.consent = {
    id: "consent-1",
    minorUserId: "minor-1",
    status: "pending",
    expiresAt: FUTURE,
    policyVersion: "3.0",
  };
  state.updateManyResult = { count: 1 };
  state.writes.updateMany = [];
  state.writes.consentRecords = [];
  vi.clearAllMocks();
});

describe("verifyGuardianConsent", () => {
  it("grants consent and writes the audit record", async () => {
    const result = await verifyGuardianConsent({ token: "tok" });

    expect(result).toEqual({ granted: true, minorUserId: "minor-1" });
    // ConsentRecord was a declared-but-never-written model while the privacy policy told
    // users their consent was recorded. This is the write that makes that claim true.
    const [record] = state.writes.consentRecords;
    expect(record.data).toMatchObject({
      userId: "minor-1",
      purpose: "guardian_consent",
      granted: true,
      source: "guardian_email_confirmation",
    });
  });

  it("refuses an expired link", async () => {
    state.consent = { ...state.consent, expiresAt: PAST };

    expect(await verifyGuardianConsent({ token: "tok" })).toEqual({ granted: false });
    expect(state.writes.consentRecords).toHaveLength(0);
  });

  it("refuses a link that was already used", async () => {
    state.consent = { ...state.consent, status: "verified" };

    expect(await verifyGuardianConsent({ token: "tok" })).toEqual({ granted: false });
  });

  it("refuses a link on a revoked consent", async () => {
    state.consent = { ...state.consent, status: "revoked" };

    expect(await verifyGuardianConsent({ token: "tok" })).toEqual({ granted: false });
  });

  it("refuses an unknown token", async () => {
    state.consent = null;

    expect(await verifyGuardianConsent({ token: "tok" })).toEqual({ granted: false });
  });

  it("re-checks status and expiry inside the update, so a replay cannot grant twice", async () => {
    // The read said pending; by the time the write lands the student has re-requested against
    // a corrected address, which supersedes this token.
    state.updateManyResult = { count: 0 };

    expect(await verifyGuardianConsent({ token: "tok" })).toEqual({ granted: false });

    const [call] = state.writes.updateMany;
    expect((call.where as AnyRecord).status).toBe("pending");
    expect((call.where as AnyRecord).expiresAt).toBeDefined();
    // And no audit row claiming a consent that was not granted.
    expect(state.writes.consentRecords).toHaveLength(0);
  });
});

describe("guardianBookingEligibility", () => {
  it("lets an adult book without touching the consent table", async () => {
    expect(await guardianBookingEligibility({ isMinor: false, minorUserId: "u" })).toEqual({
      allowed: true,
    });
  });

  /**
   * The assertion this whole change exists for. An account with no stated date of birth is
   * NOT an adult — that assumption is precisely what the old `confirmedAdult` checkbox
   * encoded, and it is how a child ends up in a video room with a stranger unremarked.
   */
  it("refuses a booking when the age is unknown", async () => {
    expect(await guardianBookingEligibility({ isMinor: null, minorUserId: "u" })).toEqual({
      allowed: false,
      reason: "age_unknown",
    });
  });

  it("refuses a minor with no consent request at all", async () => {
    state.consent = null;

    expect(await guardianBookingEligibility({ isMinor: true, minorUserId: "u" })).toEqual({
      allowed: false,
      reason: "consent_missing",
    });
  });

  it("refuses a minor whose guardian has not answered yet", async () => {
    state.consent = { status: "pending" };

    expect(await guardianBookingEligibility({ isMinor: true, minorUserId: "u" })).toEqual({
      allowed: false,
      reason: "consent_pending",
    });
  });

  it("refuses a minor whose guardian withdrew permission", async () => {
    state.consent = { status: "revoked" };

    expect(await guardianBookingEligibility({ isMinor: true, minorUserId: "u" })).toEqual({
      allowed: false,
      reason: "consent_revoked",
    });
  });

  it("allows a minor once the guardian has verified", async () => {
    state.consent = { status: "verified" };

    expect(await guardianBookingEligibility({ isMinor: true, minorUserId: "u" })).toEqual({
      allowed: true,
    });
  });
});
