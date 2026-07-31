/**
 * URL safety helpers.
 *
 * Zod's `z.url()` only checks that the WHATWG parser accepts the string — it accepts
 * `javascript:alert(1)` and `data:text/html,...` just as happily as an https URL. Anywhere a
 * stored URL is later rendered as an `href` or an iframe `src`, that is a stored-XSS vector,
 * so scheme and host must be constrained at the validation boundary.
 */

/** Hosts allowed as a lesson video iframe `src`. Keep in sync with `frame-src` in next.config.ts. */
export const VIDEO_EMBED_HOSTS = [
  "www.youtube-nocookie.com",
  "player.vimeo.com",
  "www.loom.com",
] as const;

export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const stripLeadingSlash = (pathname: string) => pathname.replace(/^\/+/, "");

/**
 * Normalise a pasted video URL into a canonical, allowlisted embed URL.
 *
 * Teachers paste share/watch URLs, not embed URLs, so rejecting anything non-embed would
 * read as a broken feature. Returns null when the URL is not https or not a recognised host.
 */
export function normalizeVideoEmbedUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase().replace(/^m\./, "");
  const path = stripLeadingSlash(url.pathname);

  // YouTube — watch, short, and embed forms all collapse to the no-cookie embed host.
  if (host === "youtu.be") {
    const id = path.split("/")[0];
    return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
  }
  if (host === "youtube.com" || host === "www.youtube.com" || host === "www.youtube-nocookie.com" || host === "youtube-nocookie.com") {
    const watchId = url.searchParams.get("v");
    if (watchId) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(watchId)}`;
    const match = /^(?:embed|shorts|live)\/([^/?#]+)/.exec(path);
    if (match) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(match[1])}`;
    return null;
  }

  // Vimeo — plain numeric ids, and unlisted links carrying a privacy hash.
  if (host === "vimeo.com" || host === "www.vimeo.com") {
    const match = /^(\d+)(?:\/([0-9a-zA-Z]+))?/.exec(path);
    if (!match) return null;
    return match[2]
      ? `https://player.vimeo.com/video/${match[1]}?h=${match[2]}`
      : `https://player.vimeo.com/video/${match[1]}`;
  }
  if (host === "player.vimeo.com") {
    const match = /^video\/(\d+)/.exec(path);
    if (!match) return null;
    const hash = url.searchParams.get("h");
    return hash
      ? `https://player.vimeo.com/video/${match[1]}?h=${encodeURIComponent(hash)}`
      : `https://player.vimeo.com/video/${match[1]}`;
  }

  // Loom.
  if (host === "loom.com" || host === "www.loom.com") {
    const match = /^(?:share|embed|v)\/([0-9a-zA-Z]+)/.exec(path);
    if (!match) return null;
    return `https://www.loom.com/embed/${match[1]}`;
  }

  return null;
}

/**
 * True when the value is already a canonical embed URL on an allowlisted host — the shape
 * that is safe to place in an iframe `src`.
 */
export function isAllowedVideoEmbedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (VIDEO_EMBED_HOSTS as readonly string[]).includes(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}
