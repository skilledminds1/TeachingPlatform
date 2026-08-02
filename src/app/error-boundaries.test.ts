import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * QLT-05. Only /admin and the teacher analytics page had a boundary, and both merely
 * console.error'd. Anything thrown during a server-component render elsewhere fell through
 * to Next's unstyled production error page — a bare digest on the pages where a stranger is
 * deciding whether to trust this platform with money — and nothing reached the tracker, so
 * the failures least likely to reproduce locally were the ones nobody heard about.
 *
 * A boundary is a file Next discovers by convention: nothing imports it, so nothing breaks
 * if it is deleted. These assertions are the only thing that would notice.
 */
const SHARED_SCREEN = "src/features/errors/components/error-screen.tsx";

const BOUNDARIES = [
  { file: "src/app/error.tsx", covers: "everything public — /find-tutor, /courses, teacher and course pages" },
  { file: "src/app/dashboard/error.tsx", covers: "the signed-in dashboard" },
  { file: "src/app/subscribe/error.tsx", covers: "checkout" },
  { file: "src/app/admin/error.tsx", covers: "admin" },
  { file: "src/app/dashboard/teacher/analytics/error.tsx", covers: "teacher analytics" },
];

describe("error boundaries exist for every segment that renders from the database", () => {
  for (const { file, covers } of BOUNDARIES) {
    it(`covers ${covers}`, () => {
      expect(existsSync(file), `${file} is missing`).toBe(true);
      const source = readFileSync(file, "utf8");
      expect(source).toContain('"use client"');
      // Going through the shared screen is what guarantees the capture and the branding.
      expect(
        source.includes("ErrorScreen"),
        `${file} should render the shared ErrorScreen, not its own markup`,
      ).toBe(true);
      expect(source).toContain("reset");
    });
  }
});

describe("the shared screen reports to the tracker", () => {
  it("captures the exception rather than only logging it", () => {
    const source = readFileSync(SHARED_SCREEN, "utf8");
    expect(source).toContain("Sentry.captureException");
    // The digest is what ties a user's report to the captured event.
    expect(source).toContain("digest");
  });

  it("tags captures by area so alerts can be routed", () => {
    const source = readFileSync(SHARED_SCREEN, "utf8");
    expect(source).toMatch(/tags:\s*\{\s*area/);
    for (const { file } of BOUNDARIES) {
      expect(readFileSync(file, "utf8")).toMatch(/area=/);
    }
  });
});

describe("global-error catches a broken root layout", () => {
  const FILE = "src/app/global-error.tsx";

  it("exists, because src/app/error.tsx lives inside the layout it would report on", () => {
    expect(existsSync(FILE)).toBe(true);
  });

  it("supplies its own document, since it replaces the root layout", () => {
    const source = readFileSync(FILE, "utf8");
    expect(source).toContain("<html");
    expect(source).toContain("<body");
  });

  /**
   * Whatever broke the layout may be a shared provider, so pulling in the usual component
   * tree risks the error screen failing exactly as the page did.
   */
  it("does not depend on the shared component tree", () => {
    const source = readFileSync(FILE, "utf8");
    expect(source).not.toContain("ErrorScreen");
    expect(source).not.toContain("@/components/ui/button");
  });

  it("still captures", () => {
    expect(readFileSync(FILE, "utf8")).toContain("Sentry.captureException");
  });
});
