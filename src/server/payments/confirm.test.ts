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
  coursePurchase: { updateManyResult: { count: 1 }, calls: [] as AnyRecord[] },
  refundRequest: { calls: [] as AnyRecord[] },
  paymentEvent: { created: [] as AnyRecord[], failNext: false },
  attempt: null as AnyRecord | null,
};

const tx = {
  paymentAttempt: {
    findUnique: vi.fn(async () => state.attempt),
    update: vi.fn(async () => ({})),
    updateMany: vi.fn(async () => ({ count: 0 })),
  },
  booking: {
    updateMany: vi.fn(async (args: AnyRecord) => {
      state.booking.calls.push(args);
      return state.booking.updateManyResult;
    }),
    findMany: vi.fn(async () => []),
  },
  coursePurchase: {
    updateMany: vi.fn(async (args: AnyRecord) => {
      state.coursePurchase.calls.push(args);
      return state.coursePurchase.updateManyResult;
    }),
  },
  courseEnrollment: {
    upsert: vi.fn(async () => ({})),
    updateMany: vi.fn(async () => ({})),
    // QLT-07: recomputeCourseAggregates runs inside this transaction whenever an enrollment
    // is granted or revoked, so the mock has to answer the reads it makes.
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
  },
  courseReview: {
    aggregate: vi.fn(async () => ({ _avg: { rating: null }, _count: { _all: 0 } })),
  },
  course: { update: vi.fn(async () => ({})) },
  courseCouponRedemption: {
    createMany: vi.fn(async () => ({})),
    deleteMany: vi.fn(async () => ({})),
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
    booking: { findMany: vi.fn(async () => []) },
    coursePurchase: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/lib/env", () => ({ env: { LESSON_PAYMENT_TIMEOUT_MINUTES: 30 } }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock("@/server/video/sessions", () => ({
  ensureVideoSessionForBooking: vi.fn(async () => ({})),
}));
vi.mock("@/server/notifications/notify", () => ({
  notifyBookingConfirmed: vi.fn(async () => undefined),
  notifyCoursePurchased: vi.fn(async () => undefined),
  notifyPaymentFailed: vi.fn(async () => undefined),
}));
vi.mock("@/server/integrations/google-calendar", () => ({
  syncBookingToConnectedCalendars: vi.fn(async () => undefined),
}));

const { confirmBookingPayment, confirmCoursePayment } = await import("./confirm");

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
    coursePurchaseId: null,
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
  state.coursePurchase.calls = [];
  state.refundRequest.calls = [];
  state.paymentEvent.created = [];
  state.booking.updateManyResult = { count: 1 };
  state.coursePurchase.updateManyResult = { count: 1 };
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

describe("confirmCoursePayment", () => {
  function purchaseAttempt(purchaseStatus: string) {
    return {
      id: "attempt-1",
      bookingId: null,
      coursePurchaseId: "purchase-1",
      provider: "stripe",
      status: "pending",
      amountCents: 5000,
      currency: "USD",
      teacherMerchantId: "acct_teacher",
      coursePurchase: {
        id: "purchase-1",
        status: purchaseStatus,
        amountCents: 5000,
        currency: "USD",
        courseId: "course-1",
        studentId: "student-1",
        courseCouponId: null,
      },
    };
  }

  it("completes a pending purchase and grants enrollment", async () => {
    state.attempt = purchaseAttempt("pending");
    const result = await confirmCoursePayment(CONFIRMATION);

    expect(result.confirmed).toBe(true);
    expect(tx.courseEnrollment.upsert).toHaveBeenCalled();
  });

  it("does not revive a refunded purchase or re-grant access", async () => {
    state.attempt = purchaseAttempt("refunded");
    state.coursePurchase.updateManyResult = { count: 0 };

    const result = await confirmCoursePayment(CONFIRMATION);

    expect(result.confirmed).toBe(false);
    expect(tx.courseEnrollment.upsert).not.toHaveBeenCalled();
  });

  it("scopes the completing update to pending purchases", async () => {
    state.attempt = purchaseAttempt("pending");
    await confirmCoursePayment(CONFIRMATION);

    expect((state.coursePurchase.calls[0].where as AnyRecord).status).toBe("pending");
  });
});
