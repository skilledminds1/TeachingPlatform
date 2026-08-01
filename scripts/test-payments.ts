import assert from "node:assert/strict";

import { createPayfastSignature } from "../src/services/payfast/signature";
import {
  amountsMatch,
  providerAmount,
  providerAmountToMinorUnits,
} from "../src/lib/payments/routing";
import { providersForCurrency } from "../src/lib/currencies";

function testPayfastSignature(): void {
  const signature = createPayfastSignature(
    [
      ["merchant_id", "10000100"],
      ["merchant_key", "46f0cd694581a"],
      ["amount", "100.00"],
      ["item_name", "Test Item"],
    ],
    "salt",
  );
  assert.equal(typeof signature, "string");
  assert.equal(signature.length, 32);
  const again = createPayfastSignature(
    [
      ["merchant_id", "10000100"],
      ["merchant_key", "46f0cd694581a"],
      ["amount", "100.00"],
      ["item_name", "Test Item"],
    ],
    "salt",
  );
  assert.equal(signature, again);
}

function testAmountMatching(): void {
  assert.equal(providerAmountToMinorUnits("50.00", "USD"), 5000);
  assert.equal(providerAmountToMinorUnits(12.5, "USD"), 1250);
  assert.equal(amountsMatch(5000, "50.00", "USD"), true);
  assert.equal(amountsMatch(5000, "49.99", "USD"), false);

  // INT-09: a zero-decimal currency round-trips at its own scale.
  assert.equal(providerAmount(5000, "JPY"), "5000");
  assert.equal(providerAmountToMinorUnits("5000", "JPY"), 5000);
  assert.equal(amountsMatch(5000, "5000", "JPY"), true);
  assert.equal(amountsMatch(5000, "50.00", "JPY"), false);
}

function testCurrencyRouting(): void {
  // INT-08 removed ZAR: PayPal cannot transact it, so it has no rail at all. This assertion
  // used to expect ["paypal"] and was simply stale.
  assert.deepEqual(providersForCurrency("ZAR"), []);
  assert.deepEqual(providersForCurrency("USD"), ["paypal"]);
  assert.deepEqual(providersForCurrency("JPY"), ["paypal"]);
  assert.deepEqual(providersForCurrency("PHP"), ["paypal"]);
}

testPayfastSignature();
testAmountMatching();
testCurrencyRouting();
console.log("payment unit checks passed");
