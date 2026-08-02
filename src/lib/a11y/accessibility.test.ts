import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Accessibility structure and its CI gate (GLO-03).
 *
 * The component-level hygiene was already good — every form control labelled, no image
 * missing alt text, no button without an accessible name. What was missing was structure:
 * no skip link anywhere, only `main` and `header` landmarks, and a heading outline of one H1
 * with nothing beneath it, so the marketplace filters and the entire result set were
 * unreachable by heading navigation.
 *
 * None of that throws, renders visibly wrong, or shows up in a screenshot, which is exactly
 * why it needs asserting rather than eyeballing.
 */

const read = (path: string): string => readFileSync(path, "utf8");

const PUBLIC_PAGES = [
  "src/app/find-tutor/page.tsx",
  "src/app/courses/page.tsx",
  "src/app/teachers/[slug]/page.tsx",
  "src/app/courses/[slug]/page.tsx",
];

describe("the skip link", () => {
  it("is rendered on every page, before anything else in the body", () => {
    const layout = read("src/app/layout.tsx");
    const body = layout.split("<body")[1];

    expect(body).toContain("<SkipLink />");
    // Ahead of Providers, so it is the first thing a keyboard user reaches.
    expect(body.indexOf("<SkipLink />")).toBeLessThan(body.indexOf("<Providers"));
  });

  /**
   * `display: none` and `visibility: hidden` remove an element from the accessibility tree,
   * so a skip link hidden that way is unreachable by the users it exists for. It has to stay
   * in the tab order and merely be off-screen.
   */
  it("stays in the accessibility tree while hidden", () => {
    const component = read("src/components/a11y/skip-link.tsx");
    const className = component.match(/className="([^"]+)"/)?.[1] ?? "";

    expect(component).toContain('href="#main-content"');
    expect(className).toContain("sr-only");
    // `focus:`, not `focus-visible:` — the link must appear on any focus, including focus
    // moved programmatically. Measured: with focus-visible it stayed clipped at inset(50%).
    expect(className).toContain("focus:not-sr-only");
    // Asserted on the class list, not the file — the prose above it discusses `hidden`
    // precisely to explain why it must not be used here.
    expect(className.split(/\s+/)).not.toContain("hidden");
    expect(className.split(/\s+/)).not.toContain("invisible");
  });

  /** A skip link pointing at an id that does not exist silently does nothing. */
  it("has a target in every file that renders a main landmark", () => {
    const files = [
      ...PUBLIC_PAGES,
      "src/app/dashboard/teacher/layout.tsx",
      "src/app/admin/layout.tsx",
    ];

    for (const file of files) {
      const source = read(file);
      if (!source.includes("<main")) continue;
      expect(source, `${file} needs the skip-link target`).toMatch(
        /<main[^>]*id="main-content"/,
      );
    }
  });
});

/**
 * The base layer set an outline COLOUR but left outline-style at `none`, so plain anchors —
 * the wordmark, footer links, pagination — showed no focus indicator at all. Buttons looked
 * correct because the UI kit adds its own ring, which is exactly what made it easy to miss.
 */
describe("focus visibility", () => {
  it("gives every focusable element a visible indicator", () => {
    const css = read("src/styles/globals.css");
    const rule = css.split(":focus-visible {")[1]?.split("}")[0] ?? "";

    expect(rule).toContain("outline:");
    expect(rule).not.toMatch(/outline:\s*none/);
    expect(rule).toContain("outline-offset");
  });
});

describe("landmarks and heading outline on public pages", () => {
  it("gives every public page a contentinfo landmark", () => {
    for (const page of PUBLIC_PAGES) {
      expect(read(page), `${page} has no footer landmark`).toContain("<SiteFooter />");
    }
  });

  /**
   * The marketplace headers were a bare div of links, so there was no navigation region to
   * jump to — the only way past them was to tab through every one.
   *
   * Asserted on the presence of a LABELLED nav rather than on the label's text: GLO-01 moved
   * that string into the catalogue, and a test that pins the English wording would fail on
   * every locale that translates it correctly.
   */
  it("marks the marketplace header links as labelled navigation", () => {
    for (const page of ["src/app/find-tutor/page.tsx", "src/app/courses/page.tsx"]) {
      expect(read(page), `${page} header is not a nav`).toMatch(/<nav\s+aria-label=[{"]/);
    }
  });

  /**
   * Both pages were a single H1. A screen-reader user skimming by heading could not reach
   * the filter panel or the results, and had to tab through every filter to reach the first
   * tutor. The headings are visually hidden because the design already communicates both to
   * anyone who can see it — the outline was what was missing, not the labels.
   */
  it("gives the filters and results their own headings", () => {
    for (const page of ["src/app/find-tutor/page.tsx", "src/app/courses/page.tsx"]) {
      const source = read(page);
      expect(source, `${page} filters heading`).toMatch(
        /<h2 id="filters-heading" className="sr-only">/,
      );
      expect(source, `${page} results heading`).toMatch(
        /<h2 id="results-heading" className="sr-only">/,
      );
      expect(source).toContain('aria-labelledby="filters-heading"');
    }
  });
});

describe("the CI gate", () => {
  const config = read("eslint.config.mjs");

  /**
   * Without this the good labelling that already exists is one refactor away from
   * regressing, with nothing to catch it. `npm run lint` already runs in CI.
   */
  it("runs the full jsx-a11y recommended set, not the Next.js subset", () => {
    expect(config).toContain("eslint-plugin-jsx-a11y");
    expect(config).toContain("jsxA11y.flatConfigs.recommended.rules");
  });

  it("teaches the label rule about the UI kit's control components", () => {
    expect(config).toContain("jsx-a11y/label-has-associated-control");
    expect(config).toContain("controlComponents");
  });

  /**
   * Exactly one rule is switched off, and it is a genuine product limitation rather than a
   * lint convenience: every video on the platform is user-uploaded and there is no
   * transcription pipeline. If it is ever disabled, the reason has to be written down and
   * disclosed to users — not silently dropped.
   */
  it("documents the one disabled rule and discloses it to users", () => {
    expect(config).toContain('"jsx-a11y/media-has-caption": "off"');
    expect(config).toContain("/accessibility");

    const statement = read("src/app/accessibility/page.tsx");
    expect(statement.toLowerCase()).toContain("captions");
    expect(statement).toContain("Known gaps");
  });

  it("switches off nothing else", () => {
    const disabled = config.match(/"jsx-a11y\/[a-z-]+":\s*"off"/g) ?? [];
    expect(disabled).toEqual(['"jsx-a11y/media-has-caption": "off"']);
  });
});

describe("the accessibility statement", () => {
  const statement = read("src/app/accessibility/page.tsx");

  it("names a conformance target rather than claiming accessibility generally", () => {
    expect(statement).toContain("WCAG");
    expect(statement).toContain("2.2");
    expect(statement).toContain("Level AA");
    // "Partially conformant" is the honest claim while section 3 lists real gaps.
    expect(statement.toLowerCase()).toContain("partially conformant");
  });

  it("tells a blocked user how to report and what to expect", () => {
    expect(statement).toContain("Reporting a barrier");
    expect(statement.toLowerCase()).toContain("working days");
  });

  it("is reachable without signing in, and linked from the footer", () => {
    const middleware = read("src/middleware.ts");
    const publicSet = middleware.split("publicExact = new Set([")[1].split("]);")[0];
    expect(publicSet).toContain('"/accessibility"');

    // Href and catalogue key, not the English label — GLO-01 moved the text into messages/.
    const footer = read("src/features/marketing/components/site-footer.tsx");
    expect(footer).toMatch(/href: '\/accessibility', key: 'accessibility'/);
    expect(JSON.parse(read("messages/en.json")).footer.accessibility).toBe("Accessibility");
    expect(read("src/app/sitemap.ts")).toContain('path: "/accessibility"');
  });
});
