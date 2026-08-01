import { beforeEach, describe, expect, it, vi } from "vitest";

type AnyRecord = Record<string, unknown>;

const state = {
  bookingUpdateCount: 1,
  bookingCalls: [] as AnyRecord[],
  sessionCalls: [] as AnyRecord[],
};

const tx = {
  booking: {
    updateMany: vi.fn(async (args: AnyRecord) => {
      state.bookingCalls.push(args);
      return { count: state.bookingUpdateCount };
    }),
  },
  videoSession: {
    updateMany: vi.fn(async (args: AnyRecord) => {
      state.sessionCalls.push(args);
      return { count: 1 };
    }),
  },
};

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    videoSession: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/lib/observability/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/server/auth/session", () => ({ requireAuth: vi.fn() }));
vi.mock("@/services/livekit/rooms", () => ({ createLiveKitRoom: vi.fn() }));

const { finalizeExpiredSession, sessionIsExpired, SESSION_GRACE_MINUTES } = await import(
  "./sessions"
);

const NOW = new Date("2026-08-01T12:00:00.000Z");
const wellPast = new Date(NOW.getTime() - (SESSION_GRACE_MINUTES + 10) * 60_000);
const justEnded = new Date(NOW.getTime() - 5 * 60_000);

function session(overrides: Partial<{ status: string; bookingStatus: string; endsAt: Date }>) {
  return {
    id: "session-1",
    bookingId: "booking-1",
    status: overrides.status ?? "scheduled",
    booking: {
      status: overrides.bookingStatus ?? "confirmed",
      endsAt: overrides.endsAt ?? wellPast,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.bookingUpdateCount = 1;
  state.bookingCalls = [];
  state.sessionCalls = [];
});

describe("sessionIsExpired", () => {
  it("waits for the grace period after the scheduled end", () => {
    expect(sessionIsExpired(justEnded, NOW)).toBe(false);
    expect(sessionIsExpired(wellPast, NOW)).toBe(true);
  });
});

describe("finalizeExpiredSession", () => {
  it("marks a session that went live as completed", async () => {
    expect(await finalizeExpiredSession(session({ status: "live" }), NOW)).toBe("completed");
  });

  it("marks a session that never went live as no_show", async () => {
    expect(await finalizeExpiredSession(session({ status: "scheduled" }), NOW)).toBe("no_show");
  });

  it("does nothing before the grace period elapses", async () => {
    expect(await finalizeExpiredSession(session({ endsAt: justEnded }), NOW)).toBeNull();
    expect(state.bookingCalls).toHaveLength(0);
  });

  it("does nothing for an already-ended session", async () => {
    expect(await finalizeExpiredSession(session({ status: "ended" }), NOW)).toBeNull();
    expect(state.bookingCalls).toHaveLength(0);
  });

  // The regression this guard exists for: opening the session page for a booking that was
  // properly cancelled (and possibly refunded) after its scheduled end used to rewrite it to
  // no_show, destroying the cancellation record and inflating the teacher's no-show rate.
  it("only transitions bookings that are still confirmed", async () => {
    await finalizeExpiredSession(session({}), NOW);
    expect((state.bookingCalls[0].where as AnyRecord).status).toBe("confirmed");
  });

  it("reports no change when the booking is no longer confirmed", async () => {
    state.bookingUpdateCount = 0;
    expect(
      await finalizeExpiredSession(session({ bookingStatus: "cancelled" }), NOW),
    ).toBeNull();
  });

  it("scopes the session update so a concurrent end is not overwritten", async () => {
    await finalizeExpiredSession(session({}), NOW);
    expect((state.sessionCalls[0].where as AnyRecord).status).toEqual({ not: "ended" });
  });
});
