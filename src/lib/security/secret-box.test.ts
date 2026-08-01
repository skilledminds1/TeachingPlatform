import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  decryptSecret,
  encryptSecret,
  hasSecretBoxKey,
  isEncrypted,
  SecretBoxKeyError,
} from "./secret-box";

const ORIGINAL_KEY = process.env.TOKEN_ENCRYPTION_KEY;

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

afterAll(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
  else process.env.TOKEN_ENCRYPTION_KEY = ORIGINAL_KEY;
});

describe("secret box", () => {
  it("round-trips a value", () => {
    const token = "1//0eXaMpLe-refresh-token_value";
    expect(decryptSecret(encryptSecret(token))).toBe(token);
  });

  it("never emits the plaintext in the stored form", () => {
    const token = "1//0eXaMpLe-refresh-token_value";
    expect(encryptSecret(token)).not.toContain(token);
  });

  it("produces a different ciphertext each time (random nonce)", () => {
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(decryptSecret(b));
  });

  it("round-trips unicode and long values", () => {
    const values = ["tökén-üñïcode-✓", "x".repeat(4096), ""];
    for (const value of values) {
      expect(decryptSecret(encryptSecret(value))).toBe(value);
    }
  });

  // Rows written before this change are still plaintext and must keep working.
  it("passes through legacy plaintext unchanged", () => {
    expect(isEncrypted("1//legacy-plaintext-token")).toBe(false);
    expect(decryptSecret("1//legacy-plaintext-token")).toBe("1//legacy-plaintext-token");
  });

  it("marks its own output as encrypted", () => {
    expect(isEncrypted(encryptSecret("value"))).toBe(true);
  });

  // GCM authentication: tampering must fail loudly rather than yield garbage.
  it("rejects a tampered ciphertext", () => {
    const encrypted = encryptSecret("value");
    const parts = encrypted.split(":");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join(":"))).toThrow();
  });

  it("rejects a malformed payload", () => {
    expect(() => decryptSecret("v1:only-one-part")).toThrow("Malformed encrypted secret");
  });

  it("reports a missing or wrong-sized key rather than encrypting weakly", () => {
    const saved = process.env.TOKEN_ENCRYPTION_KEY;

    delete process.env.TOKEN_ENCRYPTION_KEY;
    expect(hasSecretBoxKey()).toBe(false);
    expect(() => encryptSecret("value")).toThrow(SecretBoxKeyError);

    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(16).toString("base64");
    expect(hasSecretBoxKey()).toBe(false);
    expect(() => encryptSecret("value")).toThrow(/32 bytes/);

    process.env.TOKEN_ENCRYPTION_KEY = saved;
    expect(hasSecretBoxKey()).toBe(true);
  });
});
