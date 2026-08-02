import { logger } from "@/lib/observability/logger";

/**
 * Retry policy for transient "cannot reach the database" failures.
 *
 * Kept apart from src/lib/db.ts so it can be tested without constructing a PrismaClient —
 * the interesting behaviour here is which errors are retried and which are not, and that
 * should be provable without a database.
 *
 * A pooled Postgres connection is not always available the instant it is asked for. The
 * clearest case on this platform is a Supabase project resuming from pause: for a short
 * window the pooler refuses connections outright, and because Prisma does not retry, every
 * page render touching the database in that window fails. We watched exactly that —
 * `syncUserFromAuth` throwing P1001 on requests that would have succeeded a second later.
 */

/**
 * Reads only.
 *
 * A read is idempotent, so retrying it is safe anywhere — including inside a transaction
 * that is already doomed, where it returns data, the transaction still fails on its next
 * operation, and nothing is committed. Writes are deliberately absent: a failed write should
 * surface to the caller, the only layer that knows whether repeating it is meaningful.
 */
export const RETRYABLE_READ_OPERATIONS: ReadonlySet<string> = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

/** Attempts INCLUDING the first, so 3 means two retries. */
export const MAX_ATTEMPTS = 3;

/** Short enough that a user waits under a second, long enough to clear a blip. */
export const BACKOFF_MS = [100, 300];

/**
 * P1001 ONLY.
 *
 * That code means the client could not reach the server at all, so the query provably never
 * executed and repeating it cannot duplicate anything. Every other failure — a connection
 * closed mid-query (P1017), a constraint violation, a timeout — may have already run, and
 * re-running it could double a write.
 *
 * The code appears on two different Prisma error classes depending on whether the failure
 * happened while initialising the client or while issuing the query, and they expose it
 * under different property names.
 */
export function isUnreachableDatabaseError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; errorCode?: unknown };
  return candidate.code === "P1001" || candidate.errorCode === "P1001";
}

const defaultWait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run an operation, retrying only when the database was unreachable AND the operation is a
 * read. Anything else runs exactly once and its error propagates untouched.
 */
export async function runWithUnreachableRetry<T>(
  meta: { operation: string; model?: string },
  run: () => Promise<T>,
  wait: (ms: number) => Promise<void> = defaultWait,
): Promise<T> {
  if (!RETRYABLE_READ_OPERATIONS.has(meta.operation)) return run();

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (!isUnreachableDatabaseError(error)) throw error;
      lastError = error;

      const remaining = MAX_ATTEMPTS - attempt - 1;
      if (remaining === 0) break;

      logger.warn("db_unreachable_retrying", {
        model: meta.model,
        operation: meta.operation,
        attempt: attempt + 1,
        remaining,
      });
      await wait(BACKOFF_MS[attempt] ?? BACKOFF_MS[BACKOFF_MS.length - 1]);
    }
  }

  // Log before rethrowing so the failure is attributable to the database being unreachable
  // rather than to whatever page happened to be rendering.
  logger.error("db_unreachable_after_retries", {
    model: meta.model,
    operation: meta.operation,
    attempts: MAX_ATTEMPTS,
  });
  throw lastError;
}
