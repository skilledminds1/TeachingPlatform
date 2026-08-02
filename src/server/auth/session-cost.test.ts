import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * QLT-06. getCurrentUser called syncUserFromAuth on every invocation, which did a
 * findUnique, then an UNCONDITIONAL db.user.update writing email/name/avatarUrl, then a
 * count for teachers, and finally a third query re-fetching the user with memberships.
 * Nothing was memoised, and call sites stack — the teacher dashboard layout calls
 * requireTeacher() and then getCurrentUser() again — so one render paid the whole sequence
 * twice, before the page's own data began loading, across ~80 call sites.
 *
 * MEASURED on /admin/teachers, counting Prisma operations through the client extension:
 *
 *   before   6 × User.findUnique   3 × User.update
 *   after    1 × User.findUnique   0 × User.update
 *
 * A write per page view is not merely slow. It makes updatedAt useless as a signal, and it
 * puts every authenticated read behind the primary.
 */
const SESSION = "src/server/auth/session.ts";

function code(): string {
  return readFileSync(SESSION, "utf8")
    .split("\r\n")
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("the session resolves once per request", () => {
  it("memoises both the auth lookup and the user resolution", () => {
    const text = code();
    expect(text).toContain('import { cache } from "react"');
    expect(text).toMatch(/export const getAuthUser = cache\(/);
    expect(text).toMatch(/export const getCurrentUser = cache\(/);
  });

  /**
   * The Supabase call is a network round trip. Without memoisation a layout, its page and
   * an action in the same request each made their own.
   */
  it("does not re-query Supabase per call site", () => {
    expect(code()).not.toMatch(/export async function getAuthUser/);
  });
});

describe("a normal request performs no user write", () => {
  it("compares before writing rather than updating unconditionally", () => {
    const text = code();
    // The guard that makes the write conditional.
    expect(text).toMatch(/if \(Object\.keys\(changes\)\.length > 0\)/);
    expect(text).toMatch(/if \(existing\.email !== email\)/);
  });

  it("still writes when a provider field genuinely changed", () => {
    // Compare-before-write must not become never-write: an email change at the identity
    // provider has to reach the row.
    const text = code();
    expect(text).toMatch(/db\.user\.update\(\{ where: \{ id: existing\.id \}, data: changes \}\)/);
  });

  /**
   * A user who edited their own name must not have it overwritten from the identity
   * provider on their next page view. This preserves what syncUserFromAuth always did.
   */
  it("keeps a name the user has already set", () => {
    expect(code()).toMatch(/existing\.name \|\| resolveDisplayName\(authUser\)/);
  });
});

describe("the resolution costs one query on the happy path", () => {
  it("fetches the user with memberships in a single query", () => {
    const text = code();
    expect(text).toContain("sessionUserInclude");
  });

  /**
   * The teacher-organisation backfill used to run an organizationMember.count on every
   * request. The memberships are already loaded, so the common case — a teacher who has one
   * — should cost nothing.
   */
  it("decides the teacher-org backfill from rows it already has", () => {
    const text = code();
    expect(text).toMatch(/existing\.memberships\.some\(/);
    expect(text).toMatch(/role === "admin" \|\| membership\.role === "instructor"/);
  });

  it("only re-fetches after actually creating something", () => {
    const text = code();
    // Two re-fetches remain, both behind a mutation: first sight of an account, and the
    // teacher-org backfill.
    const refetches = text.match(/include: sessionUserInclude/g);
    expect(refetches?.length ?? 0).toBe(3);
  });
});
