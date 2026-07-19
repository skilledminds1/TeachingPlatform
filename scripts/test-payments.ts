import assert from "node:assert/strict";

import { createPayfastSignature } from "../src/services/payfast/signature";
import { amountsMatch, majorUnitsToCents } from "../src/lib/payments/routing";
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
  assert.equal(majorUnitsToCents("50.00"), 5000);
  assert.equal(majorUnitsToCents(12.5), 1250);
  assert.equal(amountsMatch(5000, "50.00"), true);
  assert.equal(amountsMatch(5000, "49.99"), false);
}

function testCurrencyRouting(): void {
  assert.deepEqual(providersForCurrency("ZAR"), ["paypal"]);
  assert.deepEqual(providersForCurrency("USD"), ["paypal"]);
}

testPayfastSignature();
testAmountMatching();
testCurrencyRouting();
console.log("payment unit checks passed");
