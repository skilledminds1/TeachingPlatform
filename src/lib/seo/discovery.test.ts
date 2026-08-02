import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Crawl directives, URL inventory and structured data (GLO-02).
 *
 * The failure mode here is silence. A sitemap listing redirects, a canonical pointing at the
 * wrong path, a rating of 0 from 0 reviews — none of it throws, none of it shows up in a
 * screenshot, and the cost arrives weeks later as rankings that never materialised. So these
 * assert the specific things that were wrong or would be easy to get wrong, rather than that
 * the files merely exist.
 */

type AnyRecord = Record<string, unknown>;

const state = {
  teachers: [] as AnyRecord[],
  courses: [] as AnyRecord[],
  teacherWhere: null as unknown,
  courseWhere: null as unknown,
  throwOnQuery: false,
};

vi.mock("@/lib/db", () => ({
  db: {
    teacherProfile: {
      findMany: vi.fn(async (args: AnyRecord) => {
        if (state.throwOnQuery) throw new Error("database unreachable");
        state.teacherWhere = args.where;
        return state.teachers;
      }),
    },
    course: {
      findMany: vi.fn(async (args: AnyRecord) => {
        if (state.throwOnQuery) throw new Error("database unreachable");
        state.courseWhere = args.where;
        return state.courses;
      }),
    },
  },
}));

vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_APP_URL: "https://amazing-skills.com" },
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const { default: sitemap } = await import("@/app/sitemap");
const { default: robots } = await import("@/app/robots");
const { PUBLIC_TEACHER_WHERE } = await import("@/server/marketplace/teachers");
const { PUBLIC_COURSE_WHERE } = await import("@/server/courses/queries");
const { teacherJsonLd, courseJsonLd, serializeJsonLd } = await import("./structured-data");

beforeEach(() => {
  state.teachers = [{ slug: "ana-lopez", updatedAt: new Date("2026-07-01T00:00:00.000Z") }];
  state.courses = [{ slug: "spanish-basics", updatedAt: new Date("2026-07-02T00:00:00.000Z") }];
  state.teacherWhere = null;
  state.courseWhere = null;
  state.throwOnQuery = false;
});

describe("the sitemap", () => {
  // /teachers and /teachers/[slug] permanently redirect to /find-tutor. A sitemap full of
  // 308s wastes crawl budget on hops and dilutes the signal it exists to concentrate.
  it("lists only canonical URLs, never the redirecting aliases", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls).toContain("https://amazing-skills.com/find-tutor/ana-lopez");
    expect(urls).not.toContain("https://amazing-skills.com/teachers/ana-lopez");
    expect(urls.some((url) => url.endsWith("/teachers"))).toBe(false);
    for (const url of urls) {
      expect(url, "no legacy /teachers path").not.toMatch(/\/teachers(\/|$)/);
    }
  });

  it("includes the public marketing and legal pages", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);

    for (const path of ["/", "/find-tutor", "/courses", "/terms", "/privacy"]) {
      expect(urls).toContain(`https://amazing-skills.com${path}`);
    }
  });

  it("lists published courses at their canonical path", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain("https://amazing-skills.com/courses/spanish-basics");
  });

  // The sitemap is a second consumer of a visibility rule the marketplace already owns.
  // Advertising a profile the catalog hides would send crawlers to a 404 — and could expose
  // a suspended teacher's page to anyone reading the sitemap directly.
  it("selects rows with the marketplace's own visibility predicate", async () => {
    await sitemap();

    expect(state.teacherWhere).toEqual(PUBLIC_TEACHER_WHERE);
    expect(state.courseWhere).toEqual(PUBLIC_COURSE_WHERE);
    expect(PUBLIC_TEACHER_WHERE).toMatchObject({
      status: "approved",
      deletedAt: null,
      user: { isDemo: false },
    });
    expect(PUBLIC_COURSE_WHERE).toMatchObject({ status: "published", deletedAt: null });
  });

  // A sitemap is a discovery aid, not a page anyone waits on. Failing the render would turn
  // one slow query into a broken deployment.
  it("degrades to the static routes when the database is unreachable", async () => {
    state.throwOnQuery = true;

    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls).toContain("https://amazing-skills.com/find-tutor");
    expect(urls.some((url) => url.includes("/find-tutor/"))).toBe(false);
  });
});

describe("robots", () => {
  it("points crawlers at the sitemap", () => {
    expect(robots().sitemap).toBe("https://amazing-skills.com/sitemap.xml");
  });

  it("keeps the pages the business depends on crawlable", () => {
    const rule = robots().rules;
    const disallow = (Array.isArray(rule) ? rule[0] : rule).disallow as string[];

    for (const path of ["/find-tutor", "/courses", "/terms", "/privacy"]) {
      expect(disallow, `${path} must stay indexable`).not.toContain(path);
    }
  });

  // A certificate URL is meant to be verifiable by whoever holds the link, not searchable by
  // the name of the person who earned it.
  it("keeps private and personal areas out of the index", () => {
    const rule = robots().rules;
    const disallow = (Array.isArray(rule) ? rule[0] : rule).disallow as string[];

    for (const path of ["/api/", "/admin/", "/dashboard/", "/certificates/", "/auth/"]) {
      expect(disallow).toContain(path);
    }
  });

  /**
   * The bug this closes: /robots.txt and /sitemap.xml were not in the middleware's public
   * set, so they fell through to the auth check and answered 307 → /login in production.
   */
  it("is reachable without authentication", () => {
    const middleware = readFileSync("src/middleware.ts", "utf8");
    const publicSet = middleware.split("publicExact = new Set([")[1].split("]);")[0];

    expect(publicSet).toContain('"/robots.txt"');
    expect(publicSet).toContain('"/sitemap.xml"');
    expect(middleware).toContain('pathname.startsWith("/.well-known/")');
  });
});

describe("structured data", () => {
  const teacher = {
    headline: "Spanish tutor",
    bio: "I teach conversational Spanish.",
    hourlyRateCents: 2500,
    currency: "USD",
    user: { name: "Ana Lopez", avatarUrl: null },
    subjects: [{ subject: { name: "Spanish" } }],
    rating: { average: 4.75, count: 8 },
  };

  it("describes a teacher as a Person with a priced offer", () => {
    const data = teacherJsonLd(teacher, "ana-lopez", "https://amazing-skills.com") as AnyRecord;
    const person = data.mainEntity as AnyRecord;

    expect(data["@context"]).toBe("https://schema.org");
    expect(person["@type"]).toBe("Person");
    expect(person.url).toBe("https://amazing-skills.com/find-tutor/ana-lopez");
    expect(person.makesOffer).toMatchObject({ price: "25.00", priceCurrency: "USD" });
    expect(person.aggregateRating).toMatchObject({ ratingValue: 4.75, reviewCount: 8 });
  });

  // INT-09 established that not every currency has two minor units. A ¥5000 lesson published
  // as "50.00" would be an order-of-magnitude error in a field crawlers surface directly.
  it("respects each currency's minor units in the published price", () => {
    const data = teacherJsonLd(
      { ...teacher, hourlyRateCents: 5000, currency: "JPY" },
      "ana-lopez",
      "https://amazing-skills.com",
    ) as AnyRecord;

    expect((data.mainEntity as AnyRecord).makesOffer).toMatchObject({ price: "5000" });
  });

  // Google treats a rating of 0 from 0 reviews as invalid structured data, and the penalty
  // lands on the domain rather than the field.
  it("omits aggregateRating entirely when nothing has been rated", () => {
    const data = teacherJsonLd(
      { ...teacher, rating: { average: 0, count: 0 } },
      "ana-lopez",
      "https://amazing-skills.com",
    ) as AnyRecord;

    expect(data.mainEntity).not.toHaveProperty("aggregateRating");
  });

  it("describes a course with its provider and offer", () => {
    const data = courseJsonLd(
      {
        title: "Spanish Basics",
        description: "Start speaking Spanish.",
        coverImageUrl: null,
        effectivePriceCents: 4000,
        currency: "USD",
        level: "beginner",
        ratingAverage: null,
        ratingCount: 0,
        teacher: { name: "Ana Lopez" },
      },
      "spanish-basics",
      "https://amazing-skills.com",
    ) as AnyRecord;

    expect(data["@type"]).toBe("Course");
    expect(data.provider).toMatchObject({ "@type": "Organization" });
    expect(data.offers).toMatchObject({ price: "40.00", priceCurrency: "USD" });
    expect(data).not.toHaveProperty("aggregateRating");
  });

  /**
   * A `nonce` here looks like the security-conscious choice and is actively harmful. React
   * refuses to serialize the attribute to the client, so it renders populated on the server
   * and empty on the client — an unpatched hydration mismatch on every profile and course
   * page, which `suppressHydrationWarning` does not cover because React special-cases the
   * attribute. It buys nothing either way: `application/ld+json` is a data block the browser
   * never executes, so `script-src` does not apply. Reproduced and then eliminated by
   * removing it; pinned here so it does not come back as a well-meaning hardening patch.
   */
  it("embeds structured data without a CSP nonce", () => {
    const component = readFileSync("src/components/seo/json-ld.tsx", "utf8");

    expect(component).not.toMatch(/nonce=\{/);
    expect(component).toContain("NO CSP NONCE");
  });

  /**
   * The payload carries user-authored text. JSON.stringify does not escape `<`, so a bio
   * containing `</script>` would close the tag and turn the rest of the document into
   * attacker-controlled HTML.
   */
  it("cannot break out of the script tag it is embedded in", () => {
    const serialized = serializeJsonLd(
      teacherJsonLd(
        { ...teacher, bio: 'x</script><img src=x onerror="alert(1)">' },
        "ana-lopez",
        "https://amazing-skills.com",
      ),
    );

    expect(serialized).not.toContain("</script>");
    expect(serialized).not.toContain("<img");
    // Still valid JSON, and still says what it said.
    expect(JSON.parse(serialized)).toBeTruthy();
    expect(
      ((JSON.parse(serialized) as AnyRecord).mainEntity as AnyRecord).description,
    ).toContain("</script>");
  });
});
