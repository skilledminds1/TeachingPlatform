import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * QLT-10. Course Q&A was republished on a public, SEO-indexed sales page without the
 * student ever being told. The composer said "Ask the teacher about course material", the
 * toast said "Question sent to your teacher", and askCourseQuestion stored every question
 * with hidden=false — so publication was the silent default. Someone asking a personal
 * question in a mental-health or personal-finance course found it published, with no way to
 * take it back.
 *
 * The regression that matters is subtle: a well-meaning change that reads the moderation
 * flag as if it were consent, or a query that forgets one of the two.
 */
const QUERIES = "src/server/courses/queries.ts";
const ACTIONS = "src/actions/course-quality.ts";
const SCHEMA = "prisma/schema.prisma";
const COMPOSER = "src/features/courses/components/course-community.tsx";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("consent is stored separately from moderation", () => {
  it("has its own column defaulting to false", () => {
    const model = read(SCHEMA).split("model CourseQuestion")[1].split("}")[0];
    expect(model).toMatch(/isPublic\s+Boolean\s+@default\(false\)/);
  });

  /**
   * hidden is the teacher and admin control. If consent were folded into it, a teacher
   * restoring a moderated question would publish one the student never agreed to share.
   */
  it("keeps the moderation flag defaulting to false and distinct", () => {
    const model = read(SCHEMA).split("model CourseQuestion")[1].split("}")[0];
    expect(model).toMatch(/hidden\s+Boolean\s+@default\(false\)/);
    expect(model).toContain("isPublic");
  });
});

describe("the public course page requires consent", () => {
  it("filters on isPublic as well as hidden", () => {
    const text = read(QUERIES);
    expect(
      /where:\s*\{\s*isPublic:\s*true,\s*hidden:\s*false,\s*answer:\s*\{\s*isNot:\s*null\s*\}\s*\}/.test(
        text,
      ),
      "the public question query must require isPublic AND not hidden",
    ).toBe(true);
  });

  it("never selects questions for the public page on hidden alone", () => {
    // The exact shape of the old defect.
    expect(read(QUERIES)).not.toContain("where: { hidden: false, answer: { isNot: null } }");
  });
});

describe("asking does not publish", () => {
  it("defaults the consent flag to false when it is not supplied", () => {
    const text = read(ACTIONS);
    expect(text).toMatch(/isPublic:\s*z\.boolean\(\)\.default\(false\)/);
  });

  it("stores what the student chose rather than a constant", () => {
    const ask = read(ACTIONS).split("askCourseQuestion")[1] ?? "";
    expect(ask).toContain("isPublic: parsed.data.isPublic");
  });
});

describe("students keep control after asking", () => {
  it("can publish, unpublish and delete their own question", () => {
    const text = read(ACTIONS);
    expect(text).toContain("export async function setCourseQuestionPublic");
    expect(text).toContain("export async function deleteCourseQuestion");
  });

  /**
   * Ownership is enforced in the where clause rather than by a separate guard, so a
   * mismatched id updates nothing instead of depending on a check someone can reorder.
   */
  it("scopes both to the asking student", () => {
    const text = read(ACTIONS);
    const owners = text.match(/where:\s*\{\s*id:\s*parsed\.data\.questionId,\s*studentId:\s*user\.id\s*\}/g);
    expect(owners?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

describe("the composer asks before publishing", () => {
  it("offers an unticked opt-in rather than an opt-out", () => {
    const text = read(COMPOSER);
    expect(text).toContain("useState(false)");
    expect(text).toContain("Checkbox");
  });

  it("says where the text goes, not just that names are hidden", () => {
    const text = read(COMPOSER);
    expect(text).toContain("public course page");
    expect(text.toLowerCase()).toContain("anyone can read it");
  });
});
