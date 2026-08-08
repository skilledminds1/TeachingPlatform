import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Tests for the payment state machine — the code where every critical money bug in the
 * audit lived, and which had no coverage at all.
 *
 * Prisma is mocked at the module boundary. These assert the *ordering and conditions* of
 * writes, which is where the races were: a payment landing after a booking closed, and the
 * expiry job racing a payment that lands right on the deadline.
 */

type AnyRecord = Record<string, unknown>;

const state = {
  booking: { updateManyResult: { count: 1 }, calls: [] as AnyRecord[] },
  refundRequest: { calls: [] as AnyRecord[] },
  paymentEvent: { created: [] as AnyRecord[], failNext: false },
  attempt: null as AnyRecord | null,
  // QLT-01: the refund and expiry paths write through these, so the tests need to see them.
  attemptWrites: { update: [] as AnyRecord[], updateMany: [] as AnyRecord[] },
  expiryCandidates: { bookings: [] as AnyRecord[] },
};

const tx = {
  paymentAttempt: {
    findUnique: vi.fn(async () => state.attempt),
    update: vi.fn(async (args: AnyRecord) => {
      state.attemptWrites.update.push(args);
      return {};
    }),
    updateMany: vi.fn(async (args: AnyRecord) => {
      state.attemptWrites.updateMany.push(args);
      return { count: 0 };
    }),
  },
  booking: {
    updateMany: vi.fn(async (args: AnyRecord) => {
      state.booking.calls.push(args);
      return state.booking.updateManyResult;
    }),
    findMany: vi.fn(async () => []),
  },
  refundRequest: {
    createMany: vi.fn(async (args: AnyRecord) => {
      state.refundRequest.calls.push(args);
      return { count: 1 };
    }),
    updateMany: vi.fn(async () => ({})),
  },
  paymentEvent: {
    create: vi.fn(async (args: AnyRecord) => {
      if (state.paymentEvent.failNext) {
        state.paymentEvent.failNext = false;
        throw Object.assign(new Error("dup"), { code: "P2002" });
      }
      state.paymentEvent.created.push(args);
      return {};
    }),
  },
};

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    booking: { findMany: vi.fn(async () => state.expiryCandidates.bookings) },
  },
}));
vi.mock("@/lib/env", () => ({ env: { LESSON_PAYMENT_TIMEOUT_MINUTES: 30 } }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/server/video/sessions", () => ({
  ensureVideoSessionForBooking: vi.fn(async () => ({})),
}));
const notifyPaymentFailedMock = vi.fn(async () => undefined);
vi.mock("@/server/notifications/notify", () => ({
  notifyBookingConfirmed: vi.fn(async () => undefined),
  notifyPaymentFailed: (...args: unknown[]) => notifyPaymentFailedMock(...(args as [])),
}));
vi.mock("@/server/integrations/google-calendar", () => ({
  syncBookingToConnectedCalendars: vi.fn(async () => undefined),
}));

const {
  confirmBookingPayment,
  applyRefundToAttempt,
  expireAbandonedPayments,
  markAttemptFailed,
  paymentWindowExpiry,
} = await import("./confirm");

const CONFIRMATION = {
  attemptId: "attempt-1",
  providerPaymentId: "pay_1",
  providerEventId: "evt_1",
  eventType: "checkout.session.completed",
  payload: {} as never,
  amountCents: 5000,
  currency: "USD",
  teacherMerchantId: "acct_teacher",
};

function bookingAttempt(bookingStatus: string) {
  return {
    id: "attempt-1",
    bookingId: "booking-1",
    provider: "stripe",
    status: "pending",
    amountCents: 5000,
    currency: "USD",
    teacherMerchantId: "acct_teacher",
    booking: {
      id: "booking-1",
      status: bookingStatus,
      studentId: "student-1",
      teacherId: "teacher-1",
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.booking.calls = [];
  state.refundRequest.calls = [];
  state.paymentEvent.created = [];
  state.booking.updateManyResult = { count: 1 };
  state.attemptWrites.update = [];
  state.attemptWrites.updateMany = [];
  state.expiryCandidates.bookings = [];
});

describe("confirmBookingPayment", () => {
  it("confirms a booking that is still awaiting payment", async () => {
    state.attempt = bookingAttempt("pending_payment");
    const result = await confirmBookingPayment(CONFIRMATION);

    expect(result.confirmed).toBe(true);
    expect(state.booking.calls).toHaveLength(1);
    expect(state.refundRequest.calls).toHaveLength(0);
  });

  // The core race: only a booking still in pending_payment may be confirmed.
  it("scopes the confirming update to pending_payment bookings", async () => {
    state.attempt = bookingAttempt("pending_payment");
    await confirmBookingPayment(CONFIRMATION);

    const where = state.booking.calls[0].where as AnyRecord;
    expect(where.status).toBe("pending_payment");
    expect(where.id).toBe("booking-1");
  });

  // Previously the update was unconditional, so a late payment flipped a cancelled booking
  // back to confirmed after its slot had been released to another student.
  it("does not resurrect a cancelled booking, and opens a refund request", async () => {
    state.attempt = bookingAttempt("cancelled");
    state.booking.updateManyResult = { count: 0 };

    const result = await confirmBookingPayment(CONFIRMATION);

    expect(result.confirmed).toBe(false);
    expect(state.refundRequest.calls).toHaveLength(1);
    const created = (state.refundRequest.calls[0].data as AnyRecord[])[0];
    expect(created.status).toBe("escalated");
    expect(created.requestedAmountCents).toBe(5000);
    expect(created.policyEligible).toBe(true);
  });

  it("still records the succeeded attempt when the booking is gone, so money is never lost", async () => {
    state.attempt = bookingAttempt("cancelled");
    state.booking.updateManyResult = { count: 0 };

    await confirmBookingPayment(CONFIRMATION);

    expect(tx.paymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "succeeded" }) }),
    );
  });

  it("rejects a payload whose amount does not match the stored attempt", async () => {
    state.attempt = bookingAttempt("pending_payment");
    const result = await confirmBookingPayment({ ...CONFIRMATION, amountCents: 100 });

    expect(result.confirmed).toBe(false);
    expect(state.booking.calls).toHaveLength(0);
  });

  it("rejects a payload paying a different merchant", async () => {
    state.attempt = bookingAttempt("pending_payment");
    const result = await confirmBookingPayment({
      ...CONFIRMATION,
      teacherMerchantId: "acct_attacker",
    });

    expect(result.confirmed).toBe(false);
    expect(state.booking.calls).toHaveLength(0);
  });

  it("rejects a currency mismatch", async () => {
    state.attempt = bookingAttempt("pending_payment");
    const result = await confirmBookingPayment({ ...CONFIRMATION, currency: "EUR" });

    expect(result.confirmed).toBe(false);
    expect(state.booking.calls).toHaveLength(0);
  });

  it("is idempotent when the same provider event is replayed", async () => {
    state.attempt = { ...bookingAttempt("confirmed"), status: "succeeded" };
    state.paymentEvent.failNext = true;

    const result = await confirmBookingPayment(CONFIRMATION);

    expect(result.confirmed).toBe(true);
    expect(state.booking.calls).toHaveLength(0);
  });
});

/**
 * QLT-01. The confirm paths already had coverage; these are the parts of the state machine
 * that did not — refund accumulation, and the expiry job racing a payment.
 *
 * Written against the state machine's INVARIANTS rather than PayPal's wire format, on
 * purpose. PAY-08 replaces the rail, and a test asserting the shape of a PayPal capture
 * resource dies with it; a test asserting that a refund can never exceed the charge, or
 * that an expiring booking must still be unpaid, is true of whatever processes the money
 * next.
 */
function refundAttempt(overrides: AnyRecord = {}) {
  return {
    id: "attempt-1",
    bookingId: "booking-1",
    provider: "stripe",
    status: "succeeded",
    amountCents: 5000,
    refundedCents: 0,
    currency: "USD",
    teacherMerchantId: "acct_teacher",
    ...overrides,
  };
}

const REFUND = {
  attemptId: "attempt-1",
  providerEventId: "evt_refund_1",
  eventType: "charge.refunded",
  payload: {} as never,
  refundedCents: 2000,
};

describe("applyRefundToAttempt", () => {
  it("records a partial refund without closing the payment", async () => {
    state.attempt = refundAttempt();
    await applyRefundToAttempt(REFUND);

    const [write] = state.attemptWrites.update;
    expect((write.data as AnyRecord).refundedCents).toBe(2000);
    expect((write.data as AnyRecord).status).toBe("partially_refunded");
  });

  it("closes the payment once the full amount is refunded", async () => {
    state.attempt = refundAttempt();
    await applyRefundToAttempt({ ...REFUND, refundedCents: 5000 });

    const [write] = state.attemptWrites.update;
    expect((write.data as AnyRecord).status).toBe("refunded");
  });

  /**
   * Providers report the CUMULATIVE refunded total, but they do not always report it in
   * order — a retried or out-of-sequence webhook carrying an older, smaller figure must not
   * walk the total backwards and quietly re-open a closed refund.
   */
  it("never reduces the refunded total", async () => {
    state.attempt = refundAttempt({ refundedCents: 4000, status: "partially_refunded" });
    await applyRefundToAttempt({ ...REFUND, refundedCents: 1000 });

    const [write] = state.attemptWrites.update;
    expect((write.data as AnyRecord).refundedCents).toBe(4000);
  });

  /**
   * A refund larger than the charge is either a provider bug or a currency mix-up. Either
   * way the ledger must not record more money returned than was ever taken.
   */
  it("clamps a refund that exceeds the original charge", async () => {
    state.attempt = refundAttempt();
    await applyRefundToAttempt({ ...REFUND, refundedCents: 999_999 });

    const [write] = state.attemptWrites.update;
    expect((write.data as AnyRecord).refundedCents).toBe(5000);
    expect((write.data as AnyRecord).status).toBe("refunded");
  });

  /** Webhooks are delivered at least once. A replay must not refund twice. */
  it("is idempotent when the same refund event is replayed", async () => {
    state.attempt = refundAttempt();
    state.paymentEvent.failNext = true;

    await applyRefundToAttempt(REFUND);

    expect(state.attemptWrites.update).toHaveLength(0);
  });

  it("does nothing when the attempt no longer exists", async () => {
    state.attempt = null;
    await applyRefundToAttempt(REFUND);
    expect(state.attemptWrites.update).toHaveLength(0);
  });
});

/**
 * The race the expiry job exists to lose safely: a payment landing between the SELECT that
 * chose the candidates and the UPDATE that cancels them. Cancelling a booking whose payment
 * has just succeeded leaves money captured and no lesson, which is the worst outcome
 * available to this system.
 */
describe("expireAbandonedPayments", () => {
  it("cancels a booking that is still unpaid", async () => {
    state.expiryCandidates.bookings = [{ id: "booking-1" }];
    const expired = await expireAbandonedPayments(new Date("2026-08-02T12:00:00.000Z"));
    expect(expired).toBe(1);
  });

  it("re-checks that the booking is still unpaid inside the update", async () => {
    state.expiryCandidates.bookings = [{ id: "booking-1" }];
    await expireAbandonedPayments(new Date("2026-08-02T12:00:00.000Z"));

    const [call] = state.booking.calls;
    // Without this condition the SELECT/UPDATE gap is a real window.
    expect((call.where as AnyRecord).status).toBe("pending_payment");
    expect((call.where as AnyRecord).paymentExpiresAt).toBeDefined();
  });

  it("leaves a booking alone when the payment landed first", async () => {
    state.expiryCandidates.bookings = [{ id: "booking-1" }];
    // The conditional update matches nothing: the row is no longer pending_payment.
    state.booking.updateManyResult = { count: 0 };

    const expired = await expireAbandonedPayments(new Date("2026-08-02T12:00:00.000Z"));

    expect(expired).toBe(0);
    // And critically, the succeeded attempt is not flipped to expired.
    expect(state.attemptWrites.updateMany).toHaveLength(0);
  });

  it("expires the attempt only for a booking it actually cancelled", async () => {
    state.expiryCandidates.bookings = [{ id: "booking-1" }];
    await expireAbandonedPayments(new Date("2026-08-02T12:00:00.000Z"));

    const [attemptWrite] = state.attemptWrites.updateMany;
    expect((attemptWrite.data as AnyRecord).status).toBe("expired");
    // Only attempts that were still open — never a succeeded one.
    expect((attemptWrite.where as AnyRecord).status).toEqual({
      in: ["pending", "requires_action"],
    });
  });
});

describe("markAttemptFailed", () => {
  const failure = {
    attemptId: "attempt-1",
    providerEventId: "evt_failed_1",
    eventType: "payment.failed",
    payload: {} as never,
    failureCode: "card_declined",
  };

  it("marks the attempt failed and tells the student, once", async () => {
    state.attempt = refundAttempt({ status: "pending" });
    await markAttemptFailed(failure);

    expect(state.attemptWrites.update).toHaveLength(1);
    expect(notifyPaymentFailedMock).toHaveBeenCalledTimes(1);
  });

  /**
   * Providers redeliver aggressively. Before this was gated on recordPaymentEvent's
   * `created` flag — as confirmBookingPayment and applyRefundToAttempt already were — every
   * retry of one failed payment re-wrote the attempt and sent another email.
   */
  it("does not re-write on a replayed failure event", async () => {
    state.attempt = refundAttempt({ status: "pending" });
    state.paymentEvent.failNext = true;

    await markAttemptFailed(failure);

    expect(state.attemptWrites.update).toHaveLength(0);
  });

  /**
   * The notification lives OUTSIDE the transaction, so gating the write alone would still
   * have left the student receiving one email per provider retry.
   */
  it("does not re-notify on a replayed failure event", async () => {
    state.attempt = refundAttempt({ status: "pending" });
    state.paymentEvent.failNext = true;

    await markAttemptFailed(failure);

    expect(notifyPaymentFailedMock).not.toHaveBeenCalled();
  });

  it("never overwrites an attempt that already succeeded", async () => {
    state.attempt = refundAttempt({ status: "succeeded" });
    await markAttemptFailed(failure);

    expect(state.attemptWrites.update).toHaveLength(0);
    expect(notifyPaymentFailedMock).not.toHaveBeenCalled();
  });
});

describe("paymentWindowExpiry", () => {
  it("uses the configured timeout rather than a literal", () => {
    const from = new Date("2026-08-02T12:00:00.000Z");
    // LESSON_PAYMENT_TIMEOUT_MINUTES is mocked to 30 above.
    expect(paymentWindowExpiry(from).toISOString()).toBe("2026-08-02T12:30:00.000Z");
  });
});
