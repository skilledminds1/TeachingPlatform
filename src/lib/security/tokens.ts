import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Single-use link tokens.
 *
 * Extracted from src/actions/organization-invites.ts when guardian consent became the second
 * consumer. The rule both share: the plaintext token goes in exactly one email and is never
 * written down. Only its hash is stored, so a database dump — or a leaked read replica, or a
 * Prisma Studio session — contains no working link.
 *
 * SHA-256 without a salt is correct here and would be wrong for a password. These tokens are
 * 256 bits of CSPRNG output, so there is no dictionary to attack and no work factor worth
 * paying; the hash exists to make the stored value useless, not to slow down guessing.
 */

/** 32 bytes, base64url. */
export function createLinkToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Compare two token hashes without leaking their difference through timing.
 *
 * Lookups are by unique index on the hash, which is already constant-ish, but any code that
 * compares a candidate hash to a stored one should use this rather than `===`.
 */
export function tokenHashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
