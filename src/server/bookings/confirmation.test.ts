import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Tests for booking confirmation — the transition that decides whether this product works at
 * all. Until this module existed the only writer of `confirmed` was a PayPal capture behind a
 * flag no configuration could clear, so no booking could ever be confirmed and no video room
 * was ever provisioned.
 *
 * Prisma is mocked at the module boundary. These assert the *conditions* on each write, which
 * is where the races are: an accept landing against a booking that has just expired, and the
 * expiry job cancelling a booking the teacher has just accepted. Both directions matter — one
 * resurrects a dead lesson, the other destroys a live one.
 */

type AnyRecord = Record<string, unknown>;

const state = {
  booking: {
    row: null as AnyRecord | null,
    updateManyResult: { count: 1 },
    calls: [] as AnyRecord[],
  },
  attemptWrites: { updateMany: [] as AnyRecord[] },
  expiryCandidates: [] as AnyRecord[],
};

const tx = {
  booking: {
    updateMany: vi.fn(async (args: AnyRecord) => {
      state.booking.calls.push(args);
      return state.booking.updateManyResult;
    }),
  },
  paymentAttempt: {
    updateMany: vi.fn(async (args: AnyRecord) => {
      state.attemptWrites.updateMany.push(args);
      return { count: 0 };
    }),
  },
};

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    booking: {
      findUnique: vi.fn(async () => state.booking.row),
      findMany: vi.fn(async () => state.expiryCandidates),
      updateMany: vi.fn(async (args: AnyRecord) => {
        state.booking.calls.push(args);
        return state.booking.updateManyResult;
      }),
    },
    videoSession: { findUnique: vi.fn(async () => ({ id: "session-1" })) },
  },
}));
vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
const ensureRoomMock = vi.fn(async () => ({ id: "session-1" }));
vi.mock("@/server/video/sessions", () => ({
  ensureVideoSessionForBooking: (...args: unknown[]) => ensureRoomMock(...(args as [])),
}));
const notifyConfirmedMock = vi.fn(async () => undefined);
const notifyCancelledMock = vi.fn(async () => undefined);
vi.mock("@/server/notifications/notify", () => ({
  notifyBookingConfirmed: (...args: unknown[]) => notifyConfirmedMock(...(args as [])),
  notifyBookingCancelled: (...args: unknown[]) => notifyCancelledMock(...(args as [])),
}));
vi.mock("@/server/integrations/google-calendar", () => ({
  syncBookingToConnectedCalendars: vi.fn(async () => undefined),
}));

const {
  acceptBookingRequest,
  declineBookingRequest,
  expireUnansweredBookingRequests,
  confirmationWindowExpiry,
  CONFIRMATION_WINDOW_HOURS,
} = await import("./confirmation");

const PENDING = {
  id: "booking-1",
  teacherId: "teacher-1",
  status: "pending_teacher_confirmation",
};

beforeEach(() => {
  state.booking.row = { ...PENDING };
  state.booking.updateManyResult = { count: 1 };
  state.booking.calls = [];
  state.attemptWrites.updateMany = [];
  state.expiryCandidates = [];
  vi.clearAllMocks();
  ensureRoomMock.mockResolvedValue({ id: "session-1" });
});

describe("acceptBookingRequest", () => {
  it("confirms the booking and provisions the room", async () => {
    const result = await acceptBookingRequest({
      bookingId: "booking-1",
      teacherId: "teacher-1",
    });

    expect(result).toEqual({ ok: true, bookingId: "booking-1" });
    expect(ensureRoomMock).toHaveBeenCalledWith("booking-1");
    expect(notifyConfirmedMock).toHaveBeenCalledWith("booking-1");
  });

  it("refuses a teacher who does not own the booking", async () => {
    const result = await acceptBookingRequest({
      bookingId: "booking-1",
      teacherId: "someone-else",
    });

    expect(result).toEqual({ ok: false, reason: "not_teacher" });
    expect(state.booking.calls).toHaveLength(0);
  });

  it("refuses a booking that is not awaiting an answer", async () => {
    state.booking.row = { ...PENDING, status: "cancelled" };

    const result = await acceptBookingRequest({
      bookingId: "booking-1",
      teacherId: "teacher-1",
    });

    expect(result).toEqual({ ok: false, reason: "not_pending" });
    expect(ensureRoomMock).not.toHaveBeenCalled();
  });

  it("re-checks the status inside the update, so it cannot revive an expired booking", async () => {
    // The read said pending; by the time the write lands the expiry job has cancelled it.
    state.booking.updateManyResult = { count: 0 };

    const result = await acceptBookingRequest({
      bookingId: "booking-1",
      teacherId: "teacher-1",
    });

    expect(result).toEqual({ ok: false, reason: "not_pending" });
    const [call] = state.booking.calls;
    expect((call.where as AnyRecord).status).toBe("pending_teacher_confirmation");
    // And no room is created for a lesson that is not happening.
    expect(ensureRoomMock).not.toHaveBeenCalled();
  });

  it("still confirms when room provisioning fails", async () => {
    // A LiveKit outage must not undo an acceptance the teacher already made — the room is
    // created on demand when someone opens the session.
    ensureRoomMock.mockRejectedValueOnce(new Error("livekit down"));

    const result = await acceptBookingRequest({
      bookingId: "booking-1",
      teacherId: "teacher-1",
    });

    expect(result).toEqual({ ok: true, bookingId: "booking-1" });
  });
});

describe("declineBookingRequest", () => {
  it("cancels the booking with the teacher's reason and releases the slot", async () => {
    const result = await declineBookingRequest({
      bookingId: "booking-1",
      teacherId: "teacher-1",
      reason: "I am away that week",
    });

    expect(result).toEqual({ ok: true, bookingId: "booking-1" });
    const [call] = state.booking.calls;
    expect((call.data as AnyRecord).status).toBe("cancelled");
    expect((call.data as AnyRecord).cancellationReason).toBe("I am away that week");
    expect((call.data as AnyRecord).confirmationExpiresAt).toBeNull();
    expect(notifyCancelledMock).toHaveBeenCalledWith("booking-1");
  });

  it("refuses a teacher who does not own the booking", async () => {
    const result = await declineBookingRequest({
      bookingId: "booking-1",
      teacherId: "someone-else",
      reason: "not mine",
    });

    expect(result).toEqual({ ok: false, reason: "not_teacher" });
  });
});

/**
 * The race this job exists to lose safely: a teacher accepting between the SELECT that chose
 * the candidates and the UPDATE that cancels them. Cancelling a lesson the teacher has just
 * committed to is the worst outcome available here, because the student may already have paid
 * the teacher directly and the platform holds nothing to refund.
 */
describe("expireUnansweredBookingRequests", () => {
  it("cancels a request nobody answered", async () => {
    state.expiryCandidates = [{ id: "booking-1" }];

    const expired = await expireUnansweredBookingRequests(new Date("2026-08-08T12:00:00.000Z"));

    expect(expired).toBe(1);
    expect(notifyCancelledMock).toHaveBeenCalledWith("booking-1");
  });

  it("re-checks status and deadline inside the update", async () => {
    state.expiryCandidates = [{ id: "booking-1" }];

    await expireUnansweredBookingRequests(new Date("2026-08-08T12:00:00.000Z"));

    const [call] = state.booking.calls;
    // Without both conditions the SELECT/UPDATE gap is a real window.
    expect((call.where as AnyRecord).status).toBe("pending_teacher_confirmation");
    expect((call.where as AnyRecord).confirmationExpiresAt).toBeDefined();
  });

  it("leaves a booking alone when the teacher accepted first", async () => {
    state.expiryCandidates = [{ id: "booking-1" }];
    // The conditional update matches nothing: the row is confirmed now.
    state.booking.updateManyResult = { count: 0 };

    const expired = await expireUnansweredBookingRequests(new Date("2026-08-08T12:00:00.000Z"));

    expect(expired).toBe(0);
    // And critically, no cancellation email is sent for a lesson that is going ahead.
    expect(notifyCancelledMock).not.toHaveBeenCalled();
    expect(state.attemptWrites.updateMany).toHaveLength(0);
  });

  it("expires open payment attempts only for a booking it actually cancelled", async () => {
    state.expiryCandidates = [{ id: "booking-1" }];

    await expireUnansweredBookingRequests(new Date("2026-08-08T12:00:00.000Z"));

    const [attemptWrite] = state.attemptWrites.updateMany;
    expect((attemptWrite.data as AnyRecord).status).toBe("expired");
    // Only attempts that were still open — never a succeeded one.
    expect((attemptWrite.where as AnyRecord).status).toEqual({
      in: ["pending", "requires_action"],
    });
  });
});

describe("confirmationWindowExpiry", () => {
  it("gives a teacher three days to answer, not a checkout timeout", () => {
    const from = new Date("2026-08-08T12:00:00.000Z");
    expect(CONFIRMATION_WINDOW_HOURS).toBe(72);
    expect(confirmationWindowExpiry(from).toISOString()).toBe("2026-08-11T12:00:00.000Z");
  });
});
