/**
 * SEC-18: copy an identity provider's profile picture into our own storage, rather than
 * storing and rendering the provider's URL.
 *
 * Google sign-in puts an avatar_url on the googleusercontent.com CDN into the Supabase auth
 * metadata. That URL was being written straight to User.avatarUrl and rendered on the public
 * tutor listing, where img-src blocked it — so every teacher who signed up with Google showed
 * an empty avatar and a console CSP violation.
 *
 * WHY THE BYTES ARE IMPORTED INSTEAD OF img-src BEING WIDENED. Adding the CDN host to
 * img-src is a one-line change and it is the wrong one, for three reasons:
 *
 *  1. It does not actually fix it. Google does not serve profile photos from a single host —
 *     they appear across lh3–lh6.googleusercontent.com and move between them — so allowing
 *     lh3 fixes some teachers and leaves others broken, and the version that covers everyone
 *     is https://*.googleusercontent.com: the entire Google user-content CDN, which anyone
 *     with a Google account can put bytes on, allowed as an image source on every page of
 *     the app including the authenticated dashboards.
 *  2. The URL is not ours and does not survive. It stops resolving when the user revokes our
 *     Google access, removes the photo, or deletes the account, and nothing on our side can
 *     re-derive it. A public listing should not degrade based on a third party's account
 *     state.
 *  3. avatar_url is user-writable metadata — any signed-in user can set it with
 *     supabase.auth.updateUser({ data }) — so it is attacker-controlled input. Fetched here
 *     it is constrained by the host allowlist below and never rendered as a URL; under a
 *     widened img-src it would be rendered to other users as whatever path within the
 *     allowed host its owner chose.
 *
 * Every other avatar in the system is already a first-party object in the avatars bucket
 * (uploadTeacherAvatar, uploadStudentAvatar), so importing makes the provider path match what
 * the data model already assumed instead of introducing a second kind of avatar URL.
 */

import { logger } from "@/lib/observability/logger";
import { hasValidImageSignature, imageExtension } from "@/lib/security/image-signature";
import { createAdminClient } from "@/lib/supabase/admin";

export const AVATAR_BUCKET = "avatars";

/** Provider imports get the same ceiling as a user upload — see avatarFileSchema. */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/** A sign-in must not wait on a slow CDN; a missed import retries on the next sign-in. */
const FETCH_TIMEOUT_MS = 5_000;

/** Provider CDNs redirect occasionally. Every hop is re-checked against the allowlist. */
const MAX_REDIRECTS = 3;

/**
 * Hosts an identity provider is allowed to have put a profile picture on.
 *
 * An allowlist rather than a "is this a public address" check, because the URL arrives from
 * user-writable auth metadata: without one, a signed-in user could point avatar_url at
 * http://169.254.169.254/... and have the server fetch it for them. Suffix-matched, since
 * Google spreads avatars across lh3–lh6.googleusercontent.com.
 *
 * Apple is deliberately absent: Sign in with Apple returns a name and an email and never a
 * picture, so there is no Apple host to allow. GitHub is listed because it is the other
 * provider that would land an avatar on a blocked host the day it is enabled — today
 * signInWithGoogle in src/actions/auth.ts is the only OAuth entry point.
 */
const PROVIDER_AVATAR_HOSTS = ["googleusercontent.com", "githubusercontent.com"] as const;

/** The parsed URL if a provider could plausibly have supplied it, otherwise null. */
export function providerAvatarSource(rawUrl: string | null | undefined): URL | null {
  if (!rawUrl) return null;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;

  const allowed = PROVIDER_AVATAR_HOSTS.some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
  );
  return allowed ? url : null;
}

/**
 * Fetch, re-validating the host at every redirect.
 *
 * redirect: "manual" is the point: letting fetch follow automatically would allow an
 * allowlisted host to bounce the request to an address the allowlist exists to keep it away
 * from.
 */
async function fetchFromAllowlistedHost(source: URL): Promise<Response | null> {
  let target = source;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetch(target, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: "image/*" },
    });

    if (response.status < 300 || response.status >= 400) {
      return response.ok ? response : null;
    }

    const location = response.headers.get("location");
    if (!location) return null;

    const next = providerAvatarSource(new URL(location, target).toString());
    if (!next) return null;
    target = next;
  }

  return null;
}

/**
 * Copy a provider avatar into the avatars bucket and return its public URL.
 *
 * Returns null — never throws — for anything that is not a usable image from an allowlisted
 * host. Sign-in must not fail because a CDN was slow or a bucket write was refused; the
 * account keeps its initials fallback and the next sign-in tries again.
 */
export async function importProviderAvatar(input: {
  userId: string;
  url: string | null | undefined;
}): Promise<string | null> {
  const source = providerAvatarSource(input.url);
  if (!source) return null;

  try {
    const response = await fetchFromAllowlistedHost(source);
    if (!response) return null;

    const contentType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
    const extension = imageExtension(contentType);
    if (!extension) return null;

    const declaredBytes = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_AVATAR_BYTES) return null;

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_AVATAR_BYTES) return null;
    if (!hasValidImageSignature(bytes, contentType)) return null;

    const storage = createAdminClient().storage;
    const fileName = `provider-${Date.now()}.${extension}`;
    const storagePath = `${input.userId}/${fileName}`;

    const { error } = await storage.from(AVATAR_BUCKET).upload(storagePath, bytes, {
      contentType,
      cacheControl: "3600",
      upsert: true,
    });
    if (error) {
      logger.warn("Provider avatar could not be stored", { userId: input.userId, error });
      return null;
    }

    // Only previous *imports* are cleared. The upload actions delete every other file in the
    // folder because the user just chose the survivor; here the user chose nothing, and a
    // photo they uploaded earlier must not be destroyed by a provider import.
    const { data: existingFiles } = await storage.from(AVATAR_BUCKET).list(input.userId);
    const stalePaths =
      existingFiles
        ?.filter((file) => file.name.startsWith("provider-") && file.name !== fileName)
        .map((file) => `${input.userId}/${file.name}`) ?? [];
    if (stalePaths.length > 0) {
      await storage.from(AVATAR_BUCKET).remove(stalePaths);
    }

    const {
      data: { publicUrl },
    } = storage.from(AVATAR_BUCKET).getPublicUrl(storagePath);
    return publicUrl;
  } catch (error) {
    logger.warn("Provider avatar import failed", { userId: input.userId, error });
    return null;
  }
}
