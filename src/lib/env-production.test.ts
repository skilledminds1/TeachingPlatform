import { describe, expect, it } from "vitest";

import {
  formatEnvProblems,
  productionEnvProblems,
  shouldEnforceProductionEnv,
} from "./env-production";
import type { Env } from "./env";

/**
 * QLT-03. Each of these variables fails SILENTLY when absent — the application boots, serves
 * requests, and simply does less than it should: no email, no cron, placeholder legal text on
 * the pages that exist to be trusted. This turns them into a failed boot instead.
 */
function goodEnv(overrides: Partial<Env> = {}): Env {
  return {
    NEXT_PUBLIC_APP_URL: "https://www.amazing-skills.com",
    DATABASE_URL: "postgresql://db",
    DIRECT_URL: "postgresql://direct",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pk",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    RESEND_API_KEY: "re_key",
    RESEND_FROM_EMAIL: "Amazing Skills <hello@amazingskills.com>",
    CRON_SECRET: "cron-secret-value",
    TOKEN_ENCRYPTION_KEY: "token-key",
    LIVEKIT_URL: "wss://livekit",
    LIVEKIT_API_KEY: "lk",
    LIVEKIT_API_SECRET: "lks",
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "live_token",
    PADDLE_WEBHOOK_SECRET: "pdl_ntfset_secret",
    LEGAL_ENTITY_NAME: "Amazing Skills (Pty) Ltd",
    LEGAL_REGISTRATION_NUMBER: "2020/123456/07",
    LEGAL_BUSINESS_ADDRESS: "1 Somewhere Road, Cape Town",
    LEGAL_SUPPORT_EMAIL: "support@amazingskills.com",
    LEGAL_INFORMATION_OFFICER_EMAIL: "privacy@amazingskills.com",
    ...overrides,
  } as Env;
}

function problemFor(overrides: Partial<Env>): string[] {
  return productionEnvProblems(goodEnv(overrides)).map((problem) => problem.variable);
}

describe("a complete production environment", () => {
  it("reports nothing wrong", () => {
    expect(productionEnvProblems(goodEnv())).toEqual([]);
  });
});

describe("the app URL, which fails silently rather than loudly", () => {
  it("catches a production deploy still pointed at localhost", () => {
    // It has a default, so this boots clean and simply emails everyone a link to their own
    // machine — including the guardian-consent link sent to a parent.
    expect(problemFor({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" }))
      .toContain("NEXT_PUBLIC_APP_URL");
  });

  it("catches plain http, which breaks secure cookies", () => {
    expect(problemFor({ NEXT_PUBLIC_APP_URL: "http://amazing-skills.com" }))
      .toContain("NEXT_PUBLIC_APP_URL");
  });
});

describe("subscriptions, which are the platform's only revenue", () => {
  it("catches a missing client token, which leaves a button that opens nothing", () => {
    expect(problemFor({ NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: undefined })).toContain(
      "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN",
    );
  });

  /**
   * The worst of the silent failures. The webhook fails closed without its secret — correct
   * security — so every notification is refused and a teacher who has genuinely paid is never
   * granted the plan they bought, with the money already taken. Nothing throws, and the only
   * evidence is a subscription that exists at Paddle and not here.
   */
  it("catches a missing webhook secret, which takes money and grants nothing", () => {
    expect(problemFor({ PADDLE_WEBHOOK_SECRET: undefined })).toContain("PADDLE_WEBHOOK_SECRET");
  });
});

describe("the silent failures QLT-03 exists to catch", () => {
  it("catches a missing database, which boots clean and dies on first query", () => {
    expect(problemFor({ DATABASE_URL: undefined })).toContain("DATABASE_URL");
  });

  it("catches email falling back to the console provider", () => {
    // The dangerous one: it looks exactly like success.
    expect(problemFor({ RESEND_API_KEY: undefined })).toContain("RESEND_API_KEY");
    expect(problemFor({ EMAIL_PROVIDER: "console" })).toContain("EMAIL_PROVIDER");
  });

  it("catches a missing cron secret, which 401s every job forever", () => {
    expect(problemFor({ CRON_SECRET: undefined })).toContain("CRON_SECRET");
  });

  it("catches legal placeholders that would render verbatim to users", () => {
    expect(
      problemFor({ LEGAL_ENTITY_NAME: "[REPLACE BEFORE LAUNCH: registered entity name]" }),
    ).toContain("LEGAL_ENTITY_NAME");
    expect(problemFor({ LEGAL_SUPPORT_EMAIL: "support@example.com" })).toContain(
      "LEGAL_SUPPORT_EMAIL",
    );
  });

  it("accepts either Supabase browser key, but not neither", () => {
    expect(
      productionEnvProblems(
        goodEnv({
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
        }),
      ),
    ).toEqual([]);
    expect(
      problemFor({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined,
      }),
    ).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });
});

describe("when the check runs", () => {
  it("enforces at production boot", () => {
    expect(shouldEnforceProductionEnv("production", undefined)).toBe(true);
  });

  /**
   * `next build` also runs with NODE_ENV=production. Failing the build would break any
   * pipeline that compiles without production secrets while catching nothing a boot check
   * does not — the goal is to fail before the first request, not before the bundle.
   */
  it("does not enforce during next build", () => {
    expect(shouldEnforceProductionEnv("production", "phase-production-build")).toBe(false);
  });

  it("leaves development and test alone", () => {
    expect(shouldEnforceProductionEnv("development", undefined)).toBe(false);
    expect(shouldEnforceProductionEnv("test", undefined)).toBe(false);
    expect(shouldEnforceProductionEnv(undefined, undefined)).toBe(false);
  });
});

describe("the failure message", () => {
  /**
   * Reporting one problem per deploy attempt is how a fifteen-minute fix becomes an
   * afternoon of push, wait, read, repeat.
   */
  it("lists every problem at once, not just the first", () => {
    const problems = productionEnvProblems(
      goodEnv({ DATABASE_URL: undefined, CRON_SECRET: undefined, RESEND_API_KEY: undefined }),
    );
    expect(problems.length).toBe(3);

    const message = formatEnvProblems(problems);
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("CRON_SECRET");
    expect(message).toContain("RESEND_API_KEY");
  });

  it("says what breaks, not just what is missing", () => {
    const message = formatEnvProblems(productionEnvProblems(goodEnv({ RESEND_API_KEY: undefined })));
    expect(message).toContain("console provider");
  });
});
