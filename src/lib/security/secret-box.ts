import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Authenticated encryption for secrets held at rest in Postgres.
 *
 * SEC-11: Google OAuth refresh tokens were stored as plain columns. A refresh token for the
 * calendar.events scope is a durable credential granting read/write access to a teacher's
 * personal calendar until manually revoked — so any database dump, read replica, backup, or
 * Prisma Studio session exposed them, and (before RLS landed) so did the browser-visible
 * Supabase key.
 *
 * Format: `v1:<iv>:<authTag>:<ciphertext>`, all base64url. The version prefix lets rows
 * written before encryption be recognised and transparently upgraded on next write.
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const KEY_BYTES = 32;

export class SecretBoxKeyError extends Error {}

function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new SecretBoxKeyError("TOKEN_ENCRYPTION_KEY is not set");
  }
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== KEY_BYTES) {
    throw new SecretBoxKeyError(
      `TOKEN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes, got ${decoded.length}`,
    );
  }
  return decoded;
}

export function hasSecretBoxKey(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION}:`);
}

/**
 * Decrypt a stored secret.
 *
 * Values without the version prefix are returned unchanged: they predate this change and are
 * still plaintext. Callers should write them back encrypted when they next touch the row.
 */
export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored;

  const [, ivPart, tagPart, dataPart] = stored.split(":");
  // Check for absence, not falsiness: encrypting an empty string legitimately produces an
  // empty ciphertext segment, which a truthiness check would reject as malformed.
  if (ivPart === undefined || tagPart === undefined || dataPart === undefined) {
    throw new Error("Malformed encrypted secret");
  }
  if (!ivPart || !tagPart) {
    throw new Error("Malformed encrypted secret");
  }
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
