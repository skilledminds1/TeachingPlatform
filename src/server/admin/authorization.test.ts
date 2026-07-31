import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * SEC-05 regression guard.
 *
 * Platform-admin authorization used to live almost entirely in src/app/admin/layout.tsx.
 * A React layout is a UX boundary, not a security one: server functions and pages are
 * reachable independently of it, and several loaders queried moderation cases, safety
 * reports, user lists and audit logs with no authorization check at all.
 *
 * These tests assert the data layer defends itself, so the guard cannot be dropped by a
 * future refactor without a red test.
 */

const ADMIN_SERVER_DIR = join(process.cwd(), "src/server/admin");
const ADMIN_APP_DIR = join(process.cwd(), "src/app/admin");

function sourceFiles(dir: string, predicate: (name: string) => boolean): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(full, predicate));
    } else if (predicate(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

describe("admin server modules", () => {
  const files = sourceFiles(
    ADMIN_SERVER_DIR,
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
  );

  it("finds the admin server modules", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s guards every exported async function", (file) => {
    const source = readFileSync(file, "utf8");
    const exported = [...source.matchAll(/export async function (\w+)\s*\(/g)].map((m) => m[1]);

    for (const fn of exported) {
      // Take the slice from this declaration to the next top-level export, and require the
      // guard to appear inside it.
      const start = source.indexOf(`export async function ${fn}`);
      const next = source.indexOf("\nexport ", start + 1);
      const body = source.slice(start, next === -1 ? undefined : next);
      expect(body, `${fn} in ${file} does not call requirePlatformAdmin`).toContain(
        "requirePlatformAdmin()",
      );
    }
  });
});

describe("admin pages that query the database directly", () => {
  const pages = sourceFiles(ADMIN_APP_DIR, (name) => name === "page.tsx");

  it("finds the admin pages", () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  it.each(pages)("%s authorizes before querying", (file) => {
    const source = readFileSync(file, "utf8");
    const queriesDirectly = /\bdb\.\w+\./.test(source);
    if (!queriesDirectly) return; // delegates to a guarded loader instead

    expect(
      source.includes("requirePlatformAdmin"),
      `${file} queries db directly without requirePlatformAdmin`,
    ).toBe(true);
  });
});
