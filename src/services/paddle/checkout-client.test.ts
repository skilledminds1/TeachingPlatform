import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * What the checkout is told, asserted against the source.
 *
 * Opening a real Paddle overlay needs a browser, their CDN and a live token, so these check
 * the call is constructed correctly rather than that Paddle honours it. Crude, but each one
 * fails if someone deletes the thing it guards, which is the whole job.
 */
const SOURCE = readFileSync("src/services/paddle/checkout-client.ts", "utf8");

describe("the customer discount box", () => {
  /**
   * Both settings default to true at Paddle, so this is belt and braces — but a checkout that
   * quietly stops accepting codes is invisible from our side. The first report is a customer
   * saying their code did not work, by which point they have paid full price or given up.
   */
  it("is switched on explicitly rather than left to a Paddle default", () => {
    expect(SOURCE).toMatch(/showAddDiscounts:\s*true/);
  });

  /**
   * Paddle holds one discount at a time. A customer with a better code than the automatic sale
   * has to be able to take ours off to use theirs, or they are trapped on the worse of the two.
   */
  it("lets a customer remove an applied discount", () => {
    expect(SOURCE).toMatch(/allowDiscountRemoval:\s*true/);
  });
});

describe("what else the checkout carries", () => {
  /**
   * Paddle rejects a null discountId rather than ignoring it, so the key has to be absent
   * rather than present-and-empty. A spread guarded on truthiness is the only shape that does
   * that; `discountId: input.discountId ?? null` would break every checkout without a sale.
   */
  it("omits discountId entirely when there is no sale", () => {
    expect(SOURCE).toMatch(/\.\.\.\(input\.discountId \? \{ discountId: input\.discountId \} : \{\}\)/);
  });

  /** The webhook has no other trustworthy way to find the organization. */
  it("always sends the organization id in custom_data", () => {
    expect(SOURCE).toMatch(/customData:\s*\{\s*organization_id:\s*input\.organizationId\s*\}/);
  });

  /**
   * Sandbox has to be selected before Initialize, or the token is checked against the live
   * environment and rejected with a message that names neither.
   */
  it("selects the sandbox environment before initialising", () => {
    const setEnvironment = SOURCE.indexOf("Environment?.set");
    const initialize = SOURCE.indexOf("paddle.Initialize");
    expect(setEnvironment).toBeGreaterThan(-1);
    expect(initialize).toBeGreaterThan(-1);
    expect(setEnvironment).toBeLessThan(initialize);
  });
});
