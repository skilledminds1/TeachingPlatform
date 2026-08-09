import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Rate limiting on Postgres.
 *
 * The assertions that matter are about SHAPE, not arithmetic. A limiter that under-counts
 * under concurrency, or that evaluates its window against the calling instance's clock,
 * fails at the only moment it exists for — and both mistakes look completely fine in a
 * single-threaded test that just counts to the limit.
 */

type AnyRecord = Record<string, unknown>;

const state = {
  rows: [] as AnyRecord[],
  raw: [] as string[],
  throwNext: false,
};

vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
      state.raw.push(strings.join("?"));
      if (state.throwNext) {
        state.throwNext = false;
        throw new Error("connection lost");
      }
      return state.rows;
    }),
    $executeRaw: vi.fn(async (strings: TemplateStringsArray) => {
      state.raw.push(strings.join("?"));
      return 7;
    }),
  },
}));
vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const {
  checkRateLimit,
  deleteExpiredRateLimits,
  hasSharedRateLimitStore,
  resetMemoryRateLimits,
} = await import("./rate-limit");

const OPTIONS = { key: "signin:someone", limit: 5, windowMs: 60_000 };

beforeEach(() => {
  state.rows = [{ count: 1, reset_at: new Date(Date.now() + 60_000) }];
  state.raw = [];
  state.throwNext = false;
  resetMemoryRateLimits();
  process.env.DATABASE_URL = "postgresql://test";
  vi.clearAllMocks();
});

describe("counting", () => {
  it("allows a request inside the limit and reports what is left", async () => {
    state.rows = [{ count: 2, reset_at: new Date(Date.now() + 30_000) }];

    const result = await checkRateLimit(OPTIONS);

    expect(result.success).toBe(true);
    expect(result.remaining).toBe(3);
    expect(result.degraded).toBe(false);
  });

  it("denies once the count passes the limit", async () => {
    state.rows = [{ count: 6, reset_at: new Date(Date.now() + 30_000) }];

    const result = await checkRateLimit(OPTIONS);

    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("allows exactly at the limit, not one past it", async () => {
    state.rows = [{ count: 5, reset_at: new Date(Date.now() + 30_000) }];
    expect((await checkRateLimit(OPTIONS)).success).toBe(true);

    state.rows = [{ count: 6, reset_at: new Date(Date.now() + 30_000) }];
    expect((await checkRateLimit(OPTIONS)).success).toBe(false);
  });
});

/**
 * These pin the two properties that make it a limiter rather than a counter. They assert on
 * the SQL because that is where both properties live — there is no observable behaviour to
 * test them through without a real database and real concurrency.
 */
describe("the guarantees, asserted on the statement itself", () => {
  it("counts in a single statement, so two simultaneous requests cannot both win", async () => {
    await checkRateLimit(OPTIONS);

    const [sql] = state.raw;
    // A read-then-write loses the race: both callers read the old count, both write count+1,
    // and the limiter under-counts exactly when it is under attack. ON CONFLICT DO UPDATE
    // takes a row lock, so the increment is serialised.
    expect(sql).toContain("ON CONFLICT (key) DO UPDATE");
    expect(sql).toContain("RETURNING count, reset_at");
    // One round trip, not a read followed by a write.
    expect(state.raw).toHaveLength(1);
  });

  it("evaluates the window with the database clock, never the instance's", async () => {
    await checkRateLimit(OPTIONS);

    const [sql] = state.raw;
    // Serverless instances drift. A window boundary that depends on which machine answered
    // is not a window, and it is invisible until two instances disagree in production.
    expect(sql).toContain("now()");
    expect(sql).not.toMatch(/\$\{[^}]*Date\.now/);
  });

  it("resets the window rather than extending it when the old one has passed", async () => {
    await checkRateLimit(OPTIONS);

    const [sql] = state.raw;
    // Without the CASE the count would keep climbing forever and the key would never recover.
    expect(sql).toContain("WHEN rate_limits.reset_at <= now() THEN 1");
  });
});

describe("when the store is unavailable", () => {
  it("degrades to memory rather than throwing", async () => {
    // Throwing would turn a brief database blip into a total outage of every rate-limited
    // action, which is worse than the thing being guarded against.
    state.throwNext = true;

    const result = await checkRateLimit(OPTIONS);

    expect(result.success).toBe(true);
    // Callers guarding credentials refuse to proceed on a degraded result.
    expect(result.degraded).toBe(true);
  });

  it("degrades when the statement returns nothing", async () => {
    state.rows = [];

    expect((await checkRateLimit(OPTIONS)).degraded).toBe(true);
  });

  it("reports no shared store when there is no database at all", async () => {
    delete process.env.DATABASE_URL;

    expect(hasSharedRateLimitStore()).toBe(false);
    expect((await checkRateLimit(OPTIONS)).degraded).toBe(true);

    process.env.DATABASE_URL = "postgresql://test";
  });

  it("treats a configured database as a shared store", () => {
    // This is the point of the move: in production there is always a database, so the limiter
    // can no longer silently disable itself while the rest of the app keeps serving.
    expect(hasSharedRateLimitStore()).toBe(true);
  });
});

describe("the sweep", () => {
  it("deletes only counters whose window is well past", async () => {
    const deleted = await deleteExpiredRateLimits();

    expect(deleted).toBe(7);
    const [sql] = state.raw;
    expect(sql).toContain("DELETE FROM rate_limits");
    // Slack is deliberate: an expired row is already inert because every read compares
    // reset_at to now(), so this is housekeeping and must never race a live window.
    expect(sql).toContain("interval '1 hour'");
  });
});
