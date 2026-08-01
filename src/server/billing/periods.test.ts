import { describe, expect, it } from "vitest";

import { nextPeriodEnd } from "./periods";

const NOW = new Date("2026-08-01T09:00:00.000Z");

describe("nextPeriodEnd", () => {
  it("advances a mid-month anchor by one month", () => {
    expect(nextPeriodEnd(new Date("2026-09-15T09:00:00.000Z"), "monthly", NOW)).toEqual(
      new Date("2026-10-15T09:00:00.000Z"),
    );
  });

  // MON-19: setUTCMonth(m + 1) overflowed here — 31 January rolled to 3 March, and because
  // each renewal extends the stored value the anniversary drifted further every cycle.
  it("clamps a 31st anchor into a short month instead of overflowing", () => {
    expect(nextPeriodEnd(new Date("2027-01-31T09:00:00.000Z"), "monthly", NOW)).toEqual(
      new Date("2027-02-28T09:00:00.000Z"),
    );
    expect(nextPeriodEnd(new Date("2027-03-31T09:00:00.000Z"), "monthly", NOW)).toEqual(
      new Date("2027-04-30T09:00:00.000Z"),
    );
  });

  it("uses 29 February in a leap year", () => {
    expect(nextPeriodEnd(new Date("2028-01-31T09:00:00.000Z"), "monthly", NOW)).toEqual(
      new Date("2028-02-29T09:00:00.000Z"),
    );
  });

  // The behaviour that matters: the anniversary must never creep FORWARD, which is what the
  // old setUTCMonth overflow did (31 Jan -> 3 Mar -> 3 Apr -> ...), gradually giving away
  // free days and desynchronising invoice periods from the charge date.
  it("never drifts forward across repeated month-end renewals", () => {
    let period = new Date("2027-01-31T09:00:00.000Z");
    const days: number[] = [];
    for (let i = 0; i < 12; i++) {
      period = nextPeriodEnd(period, "monthly", NOW);
      days.push(period.getUTCDate());
    }

    // Documents the known clamp-and-stick limitation: February pins the anchor to the 28th
    // and it stays there, rather than springing back to the 31st. Strictly better than
    // forward drift; the full fix needs an original-anchor column and is deferred to the P2
    // provider migration. If this array ever starts climbing, the overflow bug is back.
    expect(days).toEqual([28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28]);
    expect(Math.max(...days)).toBeLessThanOrEqual(31);
  });

  it("keeps a mid-month anchor exactly stable across a year of renewals", () => {
    let period = new Date("2027-01-15T09:00:00.000Z");
    for (let i = 0; i < 12; i++) period = nextPeriodEnd(period, "monthly", NOW);
    expect(period.getUTCDate()).toBe(15);
    expect(period.toISOString()).toBe("2028-01-15T09:00:00.000Z");
  });

  it("advances annual periods by a year", () => {
    expect(nextPeriodEnd(new Date("2026-11-05T09:00:00.000Z"), "annual", NOW)).toEqual(
      new Date("2027-11-05T09:00:00.000Z"),
    );
  });

  it("clamps 29 February on an annual renewal into a non-leap year", () => {
    expect(nextPeriodEnd(new Date("2028-02-29T09:00:00.000Z"), "annual", NOW)).toEqual(
      new Date("2029-02-28T09:00:00.000Z"),
    );
  });

  it("starts from now when there is no period or it already lapsed", () => {
    expect(nextPeriodEnd(null, "monthly", NOW)).toEqual(new Date("2026-09-01T09:00:00.000Z"));
    expect(nextPeriodEnd(new Date("2026-01-01T09:00:00.000Z"), "monthly", NOW)).toEqual(
      new Date("2026-09-01T09:00:00.000Z"),
    );
  });
});
