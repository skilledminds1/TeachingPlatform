import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * QLT-11. searchTeachers and getTeacherBySlug — the two hottest public queries on the
 * platform — excluded demo accounts with
 * `user: { email: { not: { endsWith: "teachingplatform.local" } } }`.
 *
 * That coupled the marketplace to a seed-data naming convention, and was wrong four ways at
 * once: it hides any REAL user whose email happens to end that way, does nothing for demo
 * data seeded under a different domain, costs a join plus a string suffix scan on every
 * request, and defeats index-only strategies on teacher_profiles.
 *
 * "This account is demo data" is a property of the account. It is stored as one now.
 */
const MARKETPLACE = "src/server/marketplace/teachers.ts";
const ADMIN_DASHBOARD = "src/server/admin/dashboard.ts";
const SCHEMA = "prisma/schema.prisma";
const MIGRATION =
  "prisma/migrations/20260802120000_qlt11_demo_account_flag/migration.sql";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("the marketplace no longer keys on a seed email domain", () => {
  it("filters on the flag instead", () => {
    const text = read(MARKETPLACE);
    expect(text).toContain("user: { isDemo: false }");
  });

  it("mentions the seed domain nowhere", () => {
    expect(read(MARKETPLACE)).not.toContain("teachingplatform.local");
    expect(read(ADMIN_DASHBOARD)).not.toContain("teachingplatform.local");
  });

  /**
   * searchTeachers and getTeacherBySlug — a profile hidden from the list but reachable by
   * slug would be a strange half-exclusion.
   *
   * This used to count two literal copies of the filter. GLO-02 added a third consumer, the
   * sitemap, at which point counting copies was the wrong test: it enforced duplication as
   * the mechanism. The filter is now one exported constant spread into every query, so the
   * property to assert is that nobody hand-rolls their own.
   */
  it("applies to every public query, from one definition", () => {
    const text = read(MARKETPLACE);

    expect(text).toContain("export const PUBLIC_TEACHER_WHERE");
    const spreads = text.match(/\.\.\.PUBLIC_TEACHER_WHERE/g);
    expect(spreads?.length ?? 0).toBeGreaterThanOrEqual(2);

    // Exactly one literal — the constant itself. A second would be a query that drifted.
    const literals = text.match(/user: \{ isDemo: false \}/g);
    expect(literals?.length ?? 0).toBe(1);
  });
});

describe("the flag is a real column with a backfill", () => {
  it("exists on User, defaulting to false", () => {
    const model = read(SCHEMA).split("model User")[1].split("\n}")[0];
    expect(model).toMatch(/isDemo\s+Boolean\s+@default\(false\)/);
  });

  /**
   * Reading the email suffix is correct exactly once: migrating from the implicit rule to
   * the explicit one. Without it, every seeded account silently reappears in the marketplace.
   */
  it("backfills existing seeded accounts from the convention it replaces", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain('SET "is_demo" = true');
    expect(sql.toLowerCase()).toContain("teachingplatform.local");
  });

  it("indexes the column the marketplace filters on", () => {
    expect(read(MIGRATION)).toContain('CREATE INDEX "users_is_demo_idx"');
  });
});

describe("dead scaffolding is gone", () => {
  it("no longer ships a data-fetching library nothing calls", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["@tanstack/react-query"]).toBeUndefined();
    expect(pkg.devDependencies?.["@tanstack/react-query"]).toBeUndefined();
  });

  it("does not mount a provider for it", () => {
    const providers = read("src/components/providers.tsx");
    expect(providers).not.toContain("QueryClientProvider client");
  });

  it("documents the stack it actually uses", () => {
    expect(read("PROJECT.md")).not.toContain("| Data fetching | TanStack Query |");
  });
});

/**
 * QLT-11 asked whether the `stripe` enum member was dead scaffolding too. It is kept on
 * purpose: P2 is the migration TO Stripe, so removing it means one migration to drop it and
 * another to add it back within weeks. The empty directories that made it look abandoned are
 * what actually went.
 */
describe("the stripe enum member is kept, and says why", () => {
  it("is still declared", () => {
    const schema = read(SCHEMA);
    expect(schema).toMatch(/enum PaymentProvider \{[^}]*stripe/);
  });

  it("carries the reasoning, so it is not re-flagged as dead", () => {
    const schema = read(SCHEMA);
    const note = schema.split("enum PaymentProvider")[0].slice(-600);
    expect(note).toContain("QLT-11");
    expect(note).toContain("PAY-08");
  });
});
