import { PrismaClient } from "@prisma/client";

import { runWithUnreachableRetry } from "@/lib/db-retry";

/**
 * Absorb transient "cannot reach the database" blips instead of turning them into 500s.
 *
 * Prisma does not retry connection failures, so a Supabase project resuming from pause —
 * or any brief pooler refusal — turns every in-flight page render into an error. The policy
 * lives in src/lib/db-retry.ts, where it can be tested without a database; the two limits
 * that keep it safe (reads only, P1001 only) are documented there.
 *
 * The happy path costs one Set lookup and no allocation.
 */
function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  }).$extends({
    query: {
      $allOperations({ operation, model, args, query }) {
        return runWithUnreachableRetry({ operation, model }, () => query(args));
      },
    },
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

/**
 * The client handed to an interactive `db.$transaction(async (tx) => ...)` callback.
 *
 * `Prisma.TransactionClient` describes an UNEXTENDED client, so it stopped matching once the
 * retry extension was applied. Deriving it from `db` keeps helper signatures correct
 * automatically if the extension set ever changes again.
 */
export type DbTransactionClient = Omit<
  typeof db,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
