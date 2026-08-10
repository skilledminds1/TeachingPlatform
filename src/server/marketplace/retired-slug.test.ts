import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * A renamed teacher profile must move, not disappear.
 *
 * The slug is built from the teacher's name once, at creation, and never rebuilt. The first
 * profile on the platform was listed as "wesley(teacher)" and, after the name was corrected,
 * still answered at /find-tutor/wesley-teacher-55648c8b — the URL stating a name nobody uses.
 *
 * Renaming the slug fixes the address and breaks every link anyone already holds: a shared
 * URL, a bookmark, the sitemap entry a search engine indexed. None of those report back. The
 * profile route now falls back to the retired slug and redirects permanently, so a rename
 * costs nothing.
 *
 * Asserted against the source because the alternative is booting Next and a database inside a
 * unit test. Crude, but each one fails if someone deletes the thing it guards.
 */
const MARKETPLACE = "src/server/marketplace/teachers.ts";
const PROFILE_ROUTE = "src/app/teachers/[slug]/page.tsx";
const SCHEMA = "prisma/schema.prisma";
const MIGRATION =
  "prisma/migrations/20260810120000_teacher_profile_previous_slugs/migration.sql";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("retired slugs are recorded", () => {
  it("has a column for them, with a migration behind it", () => {
    expect(read(SCHEMA)).toMatch(/previousSlugs\s+String\[\]/);
    expect(read(MIGRATION)).toMatch(/ADD COLUMN "previous_slugs" TEXT\[\]/);
  });

  /**
   * Without an index this is a sequential scan over every profile. It only runs on a missed
   * lookup, but a missed lookup is also what a crawler hitting stale URLs generates most of.
   */
  it("indexes the column it searches inside", () => {
    expect(read(MIGRATION)).toMatch(/USING GIN \("previous_slugs"\)/);
  });
});

describe("the lookup for a retired slug", () => {
  const source = read(MARKETPLACE);

  it("searches previousSlugs", () => {
    expect(source).toMatch(/previousSlugs:\s*\{\s*has:\s*slug\s*\}/);
  });

  /**
   * The assertion that matters. A retired slug that skipped the visibility filter would be a
   * second, unguarded way to reach a profile that is unlisted, deleted, or on a plan without
   * listing — reachable by anyone who kept an old link.
   */
  it("applies the same visibility filter as a live slug", () => {
    const fn = source.slice(source.indexOf("export async function getCurrentSlugForRetiredSlug"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toContain("PUBLIC_TEACHER_WHERE");
  });
});

describe("the profile route", () => {
  const source = read(PROFILE_ROUTE);

  it("tries the retired slug before answering 404", () => {
    const fallback = source.indexOf("getCurrentSlugForRetiredSlug(slug)");
    const notFound = source.indexOf("notFound();", fallback);
    expect(fallback).toBeGreaterThan(-1);
    expect(notFound).toBeGreaterThan(fallback);
  });

  /**
   * Permanent, not temporary: a search engine has to be told the profile moved, or it keeps
   * the dead URL in its index and the redirect never stops being needed.
   */
  it("redirects permanently to the current slug", () => {
    expect(source).toMatch(
      /permanentRedirect\(`\/find-tutor\/\$\{encodeURIComponent\(currentSlug\)\}`\)/,
    );
  });
});
