/**
 * Magic-byte validation for the image formats the avatar paths accept.
 *
 * A declared MIME type is a claim by whoever supplied the bytes, never a fact about them, so
 * every upload path checks the leading bytes as well. This existed as an identical copy in
 * the teacher and the student upload actions; SEC-18 adds a third caller in
 * src/server/auth/provider-avatar.ts that applies it to bytes fetched from an identity
 * provider, and a security check kept in three places is one that eventually differs between
 * them.
 */

export function hasValidImageSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }
  if (mimeType === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}

/** The storage extension for an accepted image type; undefined for anything else. */
export function imageExtension(mimeType: string): string | undefined {
  const byType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return byType[mimeType];
}
