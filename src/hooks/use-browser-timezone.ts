"use client";

import { useSyncExternalStore } from "react";

/**
 * Resolve the browser's IANA timezone, falling back to a server-supplied value.
 *
 * INT-01/INT-06: nothing in the app ever detected the visitor's zone — there was not a
 * single `resolvedOptions()` call — so a signed-out visitor on the public booking page was
 * shown South African time with no way to change it without registering, and every new
 * account inherited the `Africa/Johannesburg` column default.
 *
 * The fallback is used for the server render so markup matches on hydration; the detected
 * zone is applied immediately afterwards. That produces one paint in the server zone, which
 * is why callers should pass the signed-in user's stored zone as `fallback` when they have
 * one — detection only matters for anonymous visitors and first-time signups.
 */
/** The browser's zone never changes during a session, so nothing to subscribe to. */
const noopSubscribe = () => () => {};

export function useBrowserTimeZone(fallback: string): string {
  return useSyncExternalStore(
    noopSubscribe,
    // Client snapshot — the real zone once hydrated.
    () => detectBrowserTimeZone() ?? fallback,
    // Server snapshot — keeps the SSR markup and the first client render identical, so
    // there is no hydration mismatch. useSyncExternalStore is the right tool here rather
    // than an effect that calls setState: React knows this value differs across
    // environments and schedules the swap itself.
    () => fallback,
  );
}

/** Read the browser's IANA zone, or null when unavailable or nonsensical. */
export function detectBrowserTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Some environments report "UTC" or an empty string when they simply do not know.
    return zone && zone.includes("/") ? zone : null;
  } catch {
    return null;
  }
}
