import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * QLT-09. Two unrelated problems living in one file.
 *
 * (a) DURABILITY. Every sync call site is fire-and-forget, and deleteEventForBooking
 *     swallowed the Google DELETE but removed the local row regardless — discarding the only
 *     copy of the external event id. A cancelled lesson then sat on the teacher's calendar
 *     as busy time permanently, with nothing left that could remove it.
 *
 * (b) DISCLOSURE. Both the create and update paths wrote
 *     `attendees: [{ email: counterpart.email }]`, putting the student's email address into
 *     the teacher's Google Calendar and the teacher's into the student's — a personal-data
 *     disclosure to a third-party processor with no consent, which also made Google send an
 *     invitation from the calendar owner's own address.
 */
const CALENDAR = "src/server/integrations/google-calendar.ts";
const CARD = "src/features/calendar/components/google-calendar-connect-card.tsx";

function read(path: string): string {
  return readFileSync(path, "utf8").split("\r\n").join("\n");
}

function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("no counterparty email reaches Google", () => {
  it("sends no attendee list at all", () => {
    expect(code(CALENDAR)).not.toMatch(/attendees:\s*\[/);
  });

  /**
   * Stronger than not sending it: the email is not even selected. A field that is never
   * fetched cannot be reintroduced by the next edit to this file.
   */
  it("does not even read the address from the database", () => {
    const text = code(CALENDAR);
    expect(text).not.toMatch(/teacher: \{ select: \{[^}]*email: true/);
    expect(text).not.toMatch(/student: \{ select: \{[^}]*email: true/);
  });

  it("still names the counterparty, which is what the owner needs", () => {
    expect(code(CALENDAR)).toMatch(/Lesson with \$\{counterpart\.name\}/);
  });
});

describe("a failed remote delete keeps the local row", () => {
  it("only deletes locally once the remote is actually gone", () => {
    const text = code(CALENDAR);
    // ok, or already-absent — 404 and 410 both mean the desired end state.
    expect(text).toMatch(/response\.ok \|\| response\.status === 404 \|\| response\.status === 410/);
    expect(text).toMatch(/if \(removed\) \{/);
  });

  it("returns early rather than orphaning the row when there is no token", () => {
    const text = code(CALENDAR);
    expect(text).toMatch(/if \(!token\) \{[\s\S]*?return;/);
  });

  it("no longer deletes the row unconditionally", () => {
    // The exact shape of the old defect: a swallowed fetch followed by an unguarded delete.
    expect(code(CALENDAR)).not.toMatch(
      /\)\.catch\(\(\) => undefined\);\s*await db\.bookingCalendarEvent\.delete/,
    );
  });
});

describe("a broken connection asks to be reconnected", () => {
  it("records the failure on the connection", () => {
    const text = code(CALENDAR);
    expect(text).toMatch(/needsReconnect: true/);
  });

  /**
   * Cleared on success, so the flag reflects the current state rather than accumulating a
   * history of transient failures that would nag forever.
   */
  it("clears the flag when a refresh succeeds", () => {
    expect(code(CALENDAR)).toMatch(/needsReconnect: false/);
  });

  it("surfaces a reconnect prompt in the UI", () => {
    const text = read(CARD);
    expect(text).toContain("needsReconnect");
    expect(text).toContain("Reconnect");
    // It must offer the action, not merely report the problem.
    expect(text).toContain("google-calendar/connect");
  });
});
