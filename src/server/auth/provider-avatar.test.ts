import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { providerAvatarSource } from "./provider-avatar";

/**
 * SEC-18. The host allowlist is the whole security boundary of the importer: avatar_url comes
 * from Supabase auth metadata, which any signed-in user can write with
 * supabase.auth.updateUser({ data }), so this function decides what the server is willing to
 * make an outbound request to.
 */
describe("providerAvatarSource", () => {
  it("accepts the hosts Google actually serves profile photos from", () => {
    // The reason img-src was not simply widened: it is not one host.
    for (const host of ["lh3", "lh4", "lh5", "lh6"]) {
      const url = `https://${host}.googleusercontent.com/a/ACg8ocLWa9QM=s96-c`;
      expect(providerAvatarSource(url)?.hostname).toBe(`${host}.googleusercontent.com`);
    }
  });

  it("accepts the GitHub avatar CDN", () => {
    expect(providerAvatarSource("https://avatars.githubusercontent.com/u/1?v=4")).not.toBeNull();
  });

  it("refuses anything that is not https", () => {
    expect(providerAvatarSource("http://lh3.googleusercontent.com/a/x")).toBeNull();
    expect(providerAvatarSource("file:///etc/passwd")).toBeNull();
    expect(providerAvatarSource("data:image/png;base64,iVBORw0KGgo=")).toBeNull();
  });

  /**
   * The SSRF case this allowlist exists for. Without it, a user could set their own
   * avatar_url to a link-local or loopback address and have the server fetch it for them.
   */
  it("refuses internal and loopback addresses", () => {
    for (const url of [
      "https://169.254.169.254/latest/meta-data/",
      "https://localhost:5432/",
      "https://127.0.0.1/",
      "https://10.0.0.1/",
      "https://metadata.google.internal/computeMetadata/v1/",
    ]) {
      expect(providerAvatarSource(url), url).toBeNull();
    }
  });

  /** Suffix matching must be anchored on a dot, or an attacker registers the rest. */
  it("refuses lookalike hosts", () => {
    for (const url of [
      "https://googleusercontent.com.evil.test/a/x",
      "https://notgoogleusercontent.com/a/x",
      "https://evil.test/lh3.googleusercontent.com/a/x",
    ]) {
      expect(providerAvatarSource(url), url).toBeNull();
    }
  });

  it("refuses junk without throwing", () => {
    expect(providerAvatarSource(null)).toBeNull();
    expect(providerAvatarSource(undefined)).toBeNull();
    expect(providerAvatarSource("")).toBeNull();
    expect(providerAvatarSource("not a url")).toBeNull();
  });
});

/**
 * These assert the shape of the fix rather than its behaviour, because the alternative —
 * exercising a real redirect chain and a real bucket — is not something a unit test can do
 * honestly. Each one is a property that, if it silently regressed, would put the blocked
 * third-party URL back on the public listing.
 */
describe("the import path stays first-party", () => {
  const source = readFileSync("src/server/auth/provider-avatar.ts", "utf8");
  const session = readFileSync("src/server/auth/session.ts", "utf8");

  it("re-checks the allowlist on every redirect hop", () => {
    // Letting fetch follow redirects itself would let an allowlisted host bounce the request
    // anywhere, which is the allowlist defeated in one header.
    expect(source).toContain('redirect: "manual"');
    expect(source).toMatch(/const next = providerAvatarSource\(/);
  });

  it("verifies the bytes are an image, not just the declared type", () => {
    expect(source).toContain("hasValidImageSignature");
  });

  it("never lets a provider URL overwrite a stored avatar", () => {
    expect(session).toMatch(/if \(input\.existingAvatarUrl\) return input\.existingAvatarUrl;/);
  });

  /**
   * The clobber that made this bug visible even for teachers who had uploaded a photo:
   * getCurrentUser re-read avatarUrl from provider metadata on every request, and Supabase
   * refreshes that metadata from Google at each sign-in.
   */
  it("does not resync the avatar on every request", () => {
    expect(session).not.toMatch(/changes\.avatarUrl/);
  });
});
