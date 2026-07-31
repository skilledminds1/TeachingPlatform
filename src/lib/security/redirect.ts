import { env } from "@/lib/env";

/**
 * Resolve a caller-supplied return path to a safe, same-origin relative path.
 *
 * Returns the path (with query and hash) when it stays on `origin`, otherwise null.
 *
 * This replaces the `path.startsWith("/") && !path.startsWith("//")` guard that was
 * copy-pasted across five auth and OAuth flows. That check is bypassable: the WHATWG URL
 * parser treats a backslash as a slash for special schemes, so `/\evil.com` passes it and
 * `new URL("/\\evil.com", origin)` resolves to `https://evil.com/`. Parsing and comparing
 * origins is the only reliable test, because it uses the same parser that will later
 * consume the value.
 */
export function safeRedirectPath(
  path: string | null | undefined,
  origin: string = env.NEXT_PUBLIC_APP_URL,
): string | null {
  if (!path || typeof path !== "string") return null;

  let resolved: URL;
  let base: URL;
  try {
    base = new URL(origin);
    resolved = new URL(path, base);
  } catch {
    return null;
  }

  if (resolved.origin !== base.origin) return null;

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

/**
 * `safeRedirectPath` with a guaranteed result, for call sites that always need somewhere
 * to send the user.
 */
export function safeRedirectPathOr(
  path: string | null | undefined,
  fallback: string,
  origin?: string,
): string {
  return safeRedirectPath(path, origin) ?? fallback;
}
