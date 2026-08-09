import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * An API must answer, never redirect, and never say 200 to a path that does not exist.
 *
 * Both halves of this were live on 9 August 2026 and both were silent:
 *
 *   A POST to an unmatched API path returned Next's not-found PAGE with a **200**. Next
 *   applies the 404 status for a GET and not for a POST, so a webhook aimed at a typo'd URL —
 *   or at /api/v1/webhooks/payfast after that rail was deleted — was told "OK". The provider
 *   marked delivery successful and stopped retrying. The notifications were gone.
 *
 *   An unauthenticated /api/ request was redirected to /login, which then answered 200 with a
 *   page of HTML. To anything that is not a browser that also reads as success.
 *
 * These are asserted against the source because the alternative is booting Next inside a unit
 * test. Crude, but it fails if someone deletes the guard, which is the point.
 */
describe("unmatched API paths", () => {
  const CATCH_ALL = "src/app/api/[...unmatched]/route.ts";

  it("has a catch-all that answers 404", () => {
    const source = readFileSync(CATCH_ALL, "utf8");
    expect(source).toMatch(/status:\s*404/);
  });

  /**
   * The bug was specifically that non-GET methods did not get the 404 status. Exporting only
   * GET would leave the exact hole this closes.
   */
  it("answers every method, not just GET", () => {
    const source = readFileSync(CATCH_ALL, "utf8");
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
      expect(source, `${method} must be handled`).toMatch(
        new RegExp(`export const ${method}\\s*=`),
      );
    }
  });
});

describe("unauthenticated API requests", () => {
  const MIDDLEWARE = readFileSync("src/middleware.ts", "utf8");

  it("answers 401 rather than redirecting to a login page", () => {
    expect(MIDDLEWARE).toMatch(/pathname\.startsWith\("\/api\/"\)/);
    expect(MIDDLEWARE).toMatch(/status:\s*401/);
  });

  /**
   * The API branch has to come BEFORE the redirect, or it never runs and the redirect it
   * exists to prevent happens anyway.
   */
  it("checks for an API path before building the login redirect", () => {
    const apiBranch = MIDDLEWARE.indexOf('pathname.startsWith("/api/")');
    const loginRedirect = MIDDLEWARE.indexOf('loginUrl.pathname = "/login"');
    expect(apiBranch).toBeGreaterThan(-1);
    expect(loginRedirect).toBeGreaterThan(-1);
    expect(apiBranch).toBeLessThan(loginRedirect);
  });
});
