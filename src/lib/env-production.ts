/**
 * Production-strict environment checks (QLT-03).
 *
 * env.ts is a genuine central zod schema, but nearly everything in it is optional, so a
 * deploy missing its most important variables starts perfectly happily and fails later, in
 * pieces, in ways that look like unrelated bugs:
 *
 *  - No DATABASE_URL: boots clean, then every request that touches Prisma throws.
 *  - No RESEND_API_KEY: silently falls back to the console provider, so real users are sent
 *    no email at all — no booking confirmations, no password resets — and nothing anywhere
 *    reports a problem.
 *  - No CRON_SECRET: isCronAuthorized fails closed, correctly, so every scheduled job
 *    returns 401 forever. Payments never expire, dunning never runs, and the only symptom is
 *    an absence.
 *  - LEGAL_* left at their defaults: pages render the literal string
 *    "[REPLACE BEFORE LAUNCH: registered entity name]" to users, on the terms and privacy
 *    pages that exist precisely to be trusted.
 *
 * Every one of those is invisible until it costs something. Checked at boot they are a
 * failed deploy instead, which is the cheapest moment to find them.
 *
 * The checks live here as a pure function of the parsed env so they can be tested directly,
 * rather than by reaching into process.env at module load and hoping.
 */
import type { Env } from "@/lib/env";

export type EnvProblem = { variable: string; problem: string };

/** The marker the LEGAL_* defaults carry. */
const PLACEHOLDER_MARKER = "[REPLACE BEFORE LAUNCH";

/** Defaults that are valid values but obviously nobody's real address. */
const PLACEHOLDER_EMAIL_DOMAIN = "@example.com";

function requireValue(
  problems: EnvProblem[],
  variable: string,
  value: unknown,
  problem: string,
): void {
  if (typeof value === "string" && value.trim().length > 0) return;
  problems.push({ variable, problem });
}

/**
 * Everything wrong with this environment for production use. Empty means good to boot.
 *
 * Deliberately returns ALL problems rather than throwing on the first: a deploy that fails
 * one variable at a time, across as many attempts as there are missing values, is how a
 * fifteen-minute fix becomes an afternoon.
 */
export function productionEnvProblems(env: Env): EnvProblem[] {
  const problems: EnvProblem[] = [];

  // Silent, not loud: this one has a default, so a production deploy that omits it boots
  // perfectly and simply builds every absolute URL against localhost — auth callbacks,
  // password-reset links, and the guardian-consent links emailed to a parent. It is also
  // NEXT_PUBLIC_, so it is inlined at BUILD time: fixing it afterwards needs a rebuild, not a
  // restart.
  if (
    env.NEXT_PUBLIC_APP_URL.includes("localhost") ||
    env.NEXT_PUBLIC_APP_URL.startsWith("http://")
  ) {
    problems.push({
      variable: "NEXT_PUBLIC_APP_URL",
      problem: `is "${env.NEXT_PUBLIC_APP_URL}" — every emailed link would point there, and it is inlined at build time`,
    });
  }

  requireValue(problems, "DATABASE_URL", env.DATABASE_URL, "the application cannot reach any database");
  requireValue(problems, "DIRECT_URL", env.DIRECT_URL, "migrations and direct queries have no connection");

  requireValue(
    problems,
    "NEXT_PUBLIC_SUPABASE_URL",
    env.NEXT_PUBLIC_SUPABASE_URL,
    "authentication cannot work without the Supabase project URL",
  );
  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    problems.push({
      variable: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      problem: "no browser Supabase key is set (publishable or anon)",
    });
  }
  requireValue(
    problems,
    "SUPABASE_SERVICE_ROLE_KEY",
    env.SUPABASE_SERVICE_ROLE_KEY,
    "server-side admin operations and storage signing will fail",
  );

  // Email. The console provider is the silent one: it looks like success.
  if (env.EMAIL_PROVIDER === "console") {
    problems.push({
      variable: "EMAIL_PROVIDER",
      problem: 'set to "console" — real users would receive no email at all',
    });
  }
  requireValue(
    problems,
    "RESEND_API_KEY",
    env.RESEND_API_KEY,
    "email silently falls back to the console provider, so no user ever receives one",
  );
  requireValue(
    problems,
    "RESEND_FROM_EMAIL",
    env.RESEND_FROM_EMAIL,
    "outbound email has no From address",
  );

  requireValue(
    problems,
    "CRON_SECRET",
    env.CRON_SECRET,
    "every scheduled job fails closed with 401 and nothing reports it (see QLT-04)",
  );

  requireValue(
    problems,
    "TOKEN_ENCRYPTION_KEY",
    env.TOKEN_ENCRYPTION_KEY,
    "OAuth tokens cannot be encrypted at rest (SEC-11)",
  );

  // Video is the product, not an add-on.
  requireValue(problems, "LIVEKIT_URL", env.LIVEKIT_URL, "lessons cannot start without the LiveKit host");
  requireValue(problems, "LIVEKIT_API_KEY", env.LIVEKIT_API_KEY, "LiveKit tokens cannot be signed");
  requireValue(problems, "LIVEKIT_API_SECRET", env.LIVEKIT_API_SECRET, "LiveKit tokens cannot be signed");

  // Subscriptions are the platform's ONLY revenue, so Paddle is not optional in production.
  //
  // Both of these fail silently rather than loudly, which is why they are checked at boot. A
  // missing client token leaves a checkout button that opens nothing. A missing webhook secret
  // is worse: the route fails closed, every notification is refused, and a teacher who has
  // genuinely paid is never granted the plan they bought — with the money already taken.
  requireValue(
    problems,
    "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN",
    env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
    "the checkout cannot open, which is the platform's only revenue",
  );
  requireValue(
    problems,
    "PADDLE_WEBHOOK_SECRET",
    env.PADDLE_WEBHOOK_SECRET,
    "every Paddle notification is refused, so paid teachers are never granted their plan",
  );


  // Legal identity. These render to users on the pages that exist to be trusted.
  const legalText: Array<[string, string]> = [
    ["LEGAL_ENTITY_NAME", env.LEGAL_ENTITY_NAME],
    ["LEGAL_REGISTRATION_NUMBER", env.LEGAL_REGISTRATION_NUMBER],
    ["LEGAL_BUSINESS_ADDRESS", env.LEGAL_BUSINESS_ADDRESS],
  ];
  for (const [variable, value] of legalText) {
    if (value.includes(PLACEHOLDER_MARKER)) {
      problems.push({ variable, problem: "still the placeholder default; it renders verbatim to users" });
    }
  }

  const legalEmails: Array<[string, string]> = [
    ["LEGAL_SUPPORT_EMAIL", env.LEGAL_SUPPORT_EMAIL],
    ["LEGAL_INFORMATION_OFFICER_EMAIL", env.LEGAL_INFORMATION_OFFICER_EMAIL],
  ];
  for (const [variable, value] of legalEmails) {
    if (value.toLowerCase().endsWith(PLACEHOLDER_EMAIL_DOMAIN)) {
      problems.push({ variable, problem: "still an example.com placeholder address" });
    }
  }

  return problems;
}

/**
 * True when these checks should run.
 *
 * `next build` also sets NODE_ENV=production, and a build is not a boot: failing it would
 * break any pipeline that compiles without production secrets, while catching nothing a
 * boot check does not. The goal is to fail before the first request, not before the bundle.
 */
export function shouldEnforceProductionEnv(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  nextPhase: string | undefined = process.env.NEXT_PHASE,
): boolean {
  return nodeEnv === "production" && nextPhase !== "phase-production-build";
}

export function formatEnvProblems(problems: EnvProblem[]): string {
  const lines = problems.map(({ variable, problem }) => `  - ${variable}: ${problem}`);
  return [
    `Refusing to start: ${problems.length} environment problem${problems.length === 1 ? "" : "s"} in production.`,
    ...lines,
    "",
    "Each of these fails silently at runtime rather than loudly here, which is why this check exists.",
  ].join("\n");
}

/** Throw if this environment is not fit to serve production traffic. */
export function assertProductionEnv(env: Env): void {
  if (!shouldEnforceProductionEnv()) return;
  const problems = productionEnvProblems(env);
  if (problems.length > 0) throw new Error(formatEnvProblems(problems));
}
