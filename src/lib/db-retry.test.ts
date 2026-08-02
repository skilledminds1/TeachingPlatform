import { describe, expect, it } from "vitest";

import {
  isUnreachableDatabaseError,
  MAX_ATTEMPTS,
  RETRYABLE_READ_OPERATIONS,
  runWithUnreachableRetry,
} from "./db-retry";

/** No real waiting; the backoff duration is not what these tests are about. */
const noWait = async () => {};

function unreachable(): Error & { code: string } {
  return Object.assign(new Error("Can't reach database server"), { code: "P1001" });
}

/** Prisma reports the same condition under `errorCode` when the client fails to initialise. */
function unreachableAtInit(): Error & { errorCode: string } {
  return Object.assign(new Error("Can't reach database server"), { errorCode: "P1001" });
}

/** Calls `run` and records how many times it was invoked. */
function countingRun<T>(behaviour: (attempt: number) => Promise<T>) {
  const state = { calls: 0 };
  return {
    state,
    run: () => {
      state.calls += 1;
      return behaviour(state.calls);
    },
  };
}

describe("isUnreachableDatabaseError", () => {
  it("recognises P1001 on both error shapes Prisma uses", () => {
    expect(isUnreachableDatabaseError(unreachable())).toBe(true);
    expect(isUnreachableDatabaseError(unreachableAtInit())).toBe(true);
  });

  /**
   * The single most important negative case. P1017 means the connection closed mid-query,
   * so the statement MAY have executed — retrying it could duplicate a write.
   */
  it("does not treat a mid-query disconnect as retryable", () => {
    expect(isUnreachableDatabaseError(Object.assign(new Error("x"), { code: "P1017" }))).toBe(
      false,
    );
  });

  it("ignores ordinary errors and non-objects", () => {
    expect(isUnreachableDatabaseError(new Error("boom"))).toBe(false);
    expect(isUnreachableDatabaseError(Object.assign(new Error("x"), { code: "P2002" }))).toBe(
      false,
    );
    expect(isUnreachableDatabaseError(null)).toBe(false);
    expect(isUnreachableDatabaseError("P1001")).toBe(false);
  });
});

describe("runWithUnreachableRetry on reads", () => {
  it("returns the result once a retry succeeds", async () => {
    const { state, run } = countingRun(async (attempt) => {
      if (attempt === 1) throw unreachable();
      return "value";
    });

    await expect(
      runWithUnreachableRetry({ operation: "findUnique", model: "User" }, run, noWait),
    ).resolves.toBe("value");
    expect(state.calls).toBe(2);
  });

  it("gives up after the attempt limit and rethrows the original error", async () => {
    const { state, run } = countingRun(async () => {
      throw unreachable();
    });

    await expect(
      runWithUnreachableRetry({ operation: "findMany", model: "Booking" }, run, noWait),
    ).rejects.toMatchObject({ code: "P1001" });
    expect(state.calls).toBe(MAX_ATTEMPTS);
  });

  it("does not retry an error that is not P1001", async () => {
    const { state, run } = countingRun(async () => {
      throw Object.assign(new Error("unique constraint"), { code: "P2002" });
    });

    await expect(
      runWithUnreachableRetry({ operation: "findFirst" }, run, noWait),
    ).rejects.toMatchObject({ code: "P2002" });
    expect(state.calls).toBe(1);
  });

  it("costs nothing when the first attempt succeeds", async () => {
    const { state, run } = countingRun(async () => "ok");
    await expect(
      runWithUnreachableRetry({ operation: "count" }, run, noWait),
    ).resolves.toBe("ok");
    expect(state.calls).toBe(1);
  });
});

/**
 * The safety property. A write that could not reach the server looks identical to one that
 * did and lost the reply, and this layer cannot tell them apart — so it must not guess.
 */
describe("runWithUnreachableRetry on writes", () => {
  it("never retries a write, even when the database was unreachable", async () => {
    for (const operation of ["create", "update", "upsert", "delete", "createMany", "$executeRaw"]) {
      const { state, run } = countingRun(async () => {
        throw unreachable();
      });

      await expect(
        runWithUnreachableRetry({ operation, model: "Booking" }, run, noWait),
      ).rejects.toMatchObject({ code: "P1001" });
      expect(state.calls, `${operation} must run exactly once`).toBe(1);
    }
  });

  it("lists only read operations as retryable", () => {
    for (const operation of RETRYABLE_READ_OPERATIONS) {
      expect(operation).toMatch(/^(find|count|aggregate|groupBy)/);
    }
    for (const write of ["create", "update", "delete", "upsert"]) {
      expect(RETRYABLE_READ_OPERATIONS.has(write), `${write} must not be retryable`).toBe(
        false,
      );
    }
  });
});
