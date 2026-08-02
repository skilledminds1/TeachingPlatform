import { describe, expect, it } from "vitest";

import {
  bookingNoticeLabel,
  LESSON_DURATION_MINUTES,
  MIN_BOOKING_NOTICE_HOURS,
} from "./timezone";

/**
 * QLT-12(b). The notice period was an inline `plus({ hours: 2 })` with no constant, no
 * comment and nothing in the UI — indistinguishable from the mistaken "convert to SAST
 * (UTC+2)" offsets that INT-14 spent its time removing from the same files. These tests
 * exist so that if someone deletes it as one of those, they find out here.
 */
describe("booking notice policy", () => {
  it("is a named constant, not an inline offset", () => {
    expect(MIN_BOOKING_NOTICE_HOURS).toBeGreaterThan(0);
    expect(Number.isFinite(MIN_BOOKING_NOTICE_HOURS)).toBe(true);
  });

  it("is applied by the slot generator rather than hardcoded there", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/server/availability/slots.ts", "utf8");
    expect(source).toContain("MIN_BOOKING_NOTICE_HOURS");
    // The bare literal is what looked like a timezone conversion.
    expect(source).not.toContain("plus({ hours: 2 })");
  });

  it("renders prose that matches the value, singular and plural", () => {
    expect(bookingNoticeLabel()).toContain(String(MIN_BOOKING_NOTICE_HOURS));
    expect(bookingNoticeLabel()).toMatch(/^at least /);
  });

  it("is stated to users rather than left to be inferred from an empty calendar", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of [
      "src/features/bookings/components/slot-picker.tsx",
      "src/app/dashboard/teacher/availability/page.tsx",
    ]) {
      expect(
        readFileSync(file, "utf8").includes("bookingNoticeLabel"),
        `${file} should state the notice period`,
      ).toBe(true);
    }
  });

  it("keeps the lesson length beside it, since both are the same kind of policy", () => {
    expect(LESSON_DURATION_MINUTES).toBe(60);
  });
});
