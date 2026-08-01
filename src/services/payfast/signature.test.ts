import { describe, expect, it } from "vitest";

import { constantTimeEqual } from "@/lib/security/compare";

import { createPayfastSignature, verifyPayfastItnSignature } from "./signature";

const PASSPHRASE = "test-passphrase";

/** An ITN payload with empty custom_str slots, which real notifications routinely carry. */
const ITN_FIELDS: Array<[string, string]> = [
  ["m_payment_id", "org-123-abc"],
  ["pf_payment_id", "1089250"],
  ["payment_status", "COMPLETE"],
  ["item_name", "Amazing Skills Professional monthly"],
  ["name_first", "Herman"],
  ["name_last", ""],
  ["amount_gross", "539.00"],
  ["custom_str1", "org-123"],
  ["custom_str2", "plan-456"],
  ["custom_str3", "monthly"],
  ["custom_str4", "2900"],
  ["custom_str5", ""],
];

describe("createPayfastSignature", () => {
  it("omits empty values by default, as PayFast's checkout procedure specifies", () => {
    const withEmpty = createPayfastSignature(ITN_FIELDS, PASSPHRASE, { includeEmpty: true });
    const withoutEmpty = createPayfastSignature(ITN_FIELDS, PASSPHRASE);
    expect(withoutEmpty).not.toBe(withEmpty);
  });

  it("always excludes the signature field itself", () => {
    const base = createPayfastSignature(ITN_FIELDS, PASSPHRASE);
    const withSignature = createPayfastSignature(
      [...ITN_FIELDS, ["signature", "deadbeef"]],
      PASSPHRASE,
    );
    expect(withSignature).toBe(base);
  });

  it("is order-sensitive, since PayFast signs fields in the order received", () => {
    const reversed = [...ITN_FIELDS].reverse();
    expect(createPayfastSignature(reversed, PASSPHRASE)).not.toBe(
      createPayfastSignature(ITN_FIELDS, PASSPHRASE),
    );
  });

  it("depends on the passphrase", () => {
    expect(createPayfastSignature(ITN_FIELDS, "other")).not.toBe(
      createPayfastSignature(ITN_FIELDS, PASSPHRASE),
    );
  });
});

describe("verifyPayfastItnSignature", () => {
  const verify = (received: string, passphrase = PASSPHRASE) =>
    verifyPayfastItnSignature({
      fields: ITN_FIELDS,
      received,
      passphrase,
      compare: constantTimeEqual,
    });

  // MON-18: which canonicalisation PayFast uses for ITNs cannot be settled from the docs.
  // Accepting either removes the risk that every legitimate notification is rejected — and
  // costs nothing, because both forms require the shared passphrase.
  it("accepts the empty-filtered form", () => {
    expect(verify(createPayfastSignature(ITN_FIELDS, PASSPHRASE))).toBe(true);
  });

  it("accepts the include-empty form", () => {
    expect(
      verify(createPayfastSignature(ITN_FIELDS, PASSPHRASE, { includeEmpty: true })),
    ).toBe(true);
  });

  it("rejects a signature made with the wrong passphrase", () => {
    expect(verify(createPayfastSignature(ITN_FIELDS, "wrong-passphrase"))).toBe(false);
  });

  it("rejects a forged or empty signature", () => {
    expect(verify("00000000000000000000000000000000")).toBe(false);
    expect(verify("")).toBe(false);
  });

  it("rejects when a signed field has been tampered with", () => {
    const valid = createPayfastSignature(ITN_FIELDS, PASSPHRASE);
    const tampered = ITN_FIELDS.map(([key, value]) =>
      key === "amount_gross" ? [key, "1.00"] : [key, value],
    ) as Array<[string, string]>;

    expect(
      verifyPayfastItnSignature({
        fields: tampered,
        received: valid,
        passphrase: PASSPHRASE,
        compare: constantTimeEqual,
      }),
    ).toBe(false);
  });

  // The route passes URLSearchParams.entries(), which is single-pass; hashing twice must
  // not consume it.
  it("works with a single-pass iterator", () => {
    const params = new URLSearchParams(ITN_FIELDS);
    const expected = createPayfastSignature(ITN_FIELDS, PASSPHRASE, { includeEmpty: true });
    expect(
      verifyPayfastItnSignature({
        fields: params.entries(),
        received: expected,
        passphrase: PASSPHRASE,
        compare: constantTimeEqual,
      }),
    ).toBe(true);
  });
});
