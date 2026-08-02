import { cookies, headers } from "next/headers";

import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  LOCALE_COOKIE,
  negotiateLocale,
  type Locale,
} from "@/i18n/locales";

/**
 * Which language to render this request in (GLO-01).
 *
 * Precedence, most explicit first:
 *
 *   1. The cookie. Someone used the switcher; that is a decision, not a guess, and it must
 *      beat everything including their account setting — otherwise changing language while
 *      signed in on a shared machine appears not to work.
 *   2. The account. Follows the user to a new device or browser, which a cookie cannot.
 *   3. Accept-Language. What the browser says, for everyone who has never chosen.
 *   4. English.
 *
 * The account lookup is React-cached per request and every page that renders a session
 * already pays for it, so this adds a query only on the first request from a signed-in user
 * who has no cookie yet. Anonymous requests never reach step 2 at all.
 *
 * Imported lazily so this module stays usable from contexts that have no database.
 */
export async function resolveLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isSupportedLocale(fromCookie)) return fromCookie;

  const fromAccount = await localeFromAccount();
  if (isSupportedLocale(fromAccount)) return fromAccount;

  const acceptLanguage = (await headers()).get("accept-language");
  return negotiateLocale(acceptLanguage);
}

async function localeFromAccount(): Promise<string | null> {
  try {
    const { getCurrentUser } = await import("@/server/auth/session");
    const user = await getCurrentUser();
    return user?.locale ?? null;
  } catch {
    // Locale resolution must never be the reason a page fails to render. A database that is
    // briefly unreachable should produce an English page, not a 500.
    return DEFAULT_LOCALE;
  }
}
