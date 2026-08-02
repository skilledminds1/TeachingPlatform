import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The after-response outbox drain (QLT-04).
 *
 * The invariant being pinned is not "the email got sent" — the outbox already guarantees that
 * eventually. It is that this opportunistic path can never make things WORSE than the cron
 * alone: it must not block the response, must not fail the request that enqueued the message,
 * must not run unbounded work, and must not exist at all outside a request scope.
 */

type AnyRecord = Record<string, unknown>;

const state = {
  afterTasks: [] as Array<() => Promise<void>>,
  /** Simulates being called outside a request scope, where Next's after() throws. */
  afterOutOfScope: false,
  drains: [] as AnyRecord[],
  drainThrows: false,
  preference: null as AnyRecord | null,
  upsertResult: { id: "outbox-1", createdAt: new Date(1), updatedAt: new Date(1) },
};

const loggerError = vi.fn();

vi.mock("next/server", () => ({
  after: (task: () => Promise<void>) => {
    if (state.afterOutOfScope) {
      throw new Error("`after()` was called outside a request scope.");
    }
    state.afterTasks.push(task);
  },
}));

vi.mock("@/server/notifications/process-outbox", () => ({
  processEmailOutbox: vi.fn(async (input: AnyRecord) => {
    if (state.drainThrows) throw new Error("email provider unreachable");
    state.drains.push(input);
    return { candidates: 0, sent: 0, retried: 0, failed: 0 };
  }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: (...args: unknown[]) => loggerError(...args), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  db: {
    userNotificationPreference: { findUnique: vi.fn(async () => state.preference) },
    emailOutbox: { upsert: vi.fn(async () => state.upsertResult) },
  },
}));

const { scheduleOutboxDrain, AFTER_RESPONSE_DRAIN_LIMIT } = await import("./outbox-trigger");
const { enqueueEmail } = await import("./email-outbox");

/** Run everything Next would have run once the response was flushed. */
async function flushAfterTasks(): Promise<void> {
  const tasks = state.afterTasks.splice(0);
  for (const task of tasks) await task();
}

beforeEach(() => {
  state.afterTasks = [];
  state.afterOutOfScope = false;
  state.drains = [];
  state.drainThrows = false;
  state.preference = null;
  state.upsertResult = { id: "outbox-1", createdAt: new Date(1), updatedAt: new Date(1) };
  loggerError.mockClear();
});

describe("scheduling the drain", () => {
  it("defers the send until the response has gone out", async () => {
    scheduleOutboxDrain();

    // Nothing has been sent yet — the request is still in flight.
    expect(state.drains).toHaveLength(0);
    expect(state.afterTasks).toHaveLength(1);

    await flushAfterTasks();
    expect(state.drains).toHaveLength(1);
  });

  // After-response work still occupies the invocation and counts against its timeout, so a
  // backlog must not turn one enqueue into a multi-minute drain.
  it("bounds how much work one request will do", async () => {
    scheduleOutboxDrain();
    await flushAfterTasks();

    expect(state.drains[0]).toEqual({ limit: AFTER_RESPONSE_DRAIN_LIMIT });
    expect(AFTER_RESPONSE_DRAIN_LIMIT).toBeGreaterThan(0);
    expect(AFTER_RESPONSE_DRAIN_LIMIT).toBeLessThanOrEqual(25);
  });

  // The message is durable in the outbox and the cron will retry it, so a failed opportunistic
  // send has lost nothing. Rejecting here would surface an error for a delivery still on track.
  it("never lets a failed drain escape into the request", async () => {
    state.drainThrows = true;
    scheduleOutboxDrain();

    await expect(flushAfterTasks()).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalledWith(
      "email_outbox_after_response_drain_failed",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  // Scripts, seeds and background tasks enqueue mail with no response to run after. That must
  // be a no-op, not a crash in the caller.
  it("is a no-op outside a request scope", async () => {
    state.afterOutOfScope = true;

    expect(() => scheduleOutboxDrain()).not.toThrow();
    expect(state.afterTasks).toHaveLength(0);
    expect(state.drains).toHaveLength(0);
  });
});

describe("enqueueEmail triggers it", () => {
  const message = {
    userId: "user-1",
    recipient: "teacher@example.com",
    subject: "Lesson confirmed",
    html: "<p>hi</p>",
    category: "transactional" as const,
    idempotencyKey: "email:abc",
  };

  it("queues a drain for a newly enqueued message", async () => {
    const result = await enqueueEmail(message);

    expect(result).toMatchObject({ enqueued: true, id: "outbox-1" });
    expect(state.afterTasks).toHaveLength(1);

    await flushAfterTasks();
    expect(state.drains).toHaveLength(1);
  });

  // An idempotency hit still leaves a row that may be pending, so it is worth draining.
  it("queues a drain on a duplicate enqueue too", async () => {
    state.upsertResult = { id: "outbox-1", createdAt: new Date(1), updatedAt: new Date(5_000) };

    const result = await enqueueEmail(message);

    expect(result).toMatchObject({ enqueued: false });
    expect(state.afterTasks).toHaveLength(1);
  });

  // The trigger sits after the preference gate. If it did not, an opted-out recipient would
  // cost a drain on every suppressed message.
  it("queues nothing when the recipient has opted out", async () => {
    state.preference = { emailReminders: false, emailMessages: false, emailMarketing: false };

    const result = await enqueueEmail({ ...message, category: "marketing" });

    expect(result).toEqual({ enqueued: false });
    expect(state.afterTasks).toHaveLength(0);
  });
});
