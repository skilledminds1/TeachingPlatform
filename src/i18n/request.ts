import { getRequestConfig } from "next-intl/server";

import { resolveLocale } from "@/i18n/resolve";

/**
 * next-intl request configuration (GLO-01).
 *
 * NO URL PREFIXES, deliberately, and it is the one significant trade-off in this change.
 *
 * Routing locales through the path (`/es/find-tutor`) is what lets each language be indexed
 * separately and `hreflang` point somewhere real — which is where the commercial value of
 * translation actually comes from. It also means moving all 71 pages under `app/[locale]/`
 * and making every `Link` locale-aware, in the same change as the string extraction and the
 * RTL work. Attempting all three at once is how a working application ends up broken.
 *
 * Locale is resolved per request from cookie, account and Accept-Language instead, and
 * URL-prefixed routing is left as its own piece of work. This is arranged so that layering it
 * on later changes this file and the middleware, not the components.
 *
 * Dates, times and currency deliberately do NOT go through next-intl's formatters. INT-03 and
 * INT-07 already centralised that in src/lib/format.ts, where the timezone is a required
 * argument precisely so nobody can render a time without saying whose time it is. A second
 * formatting mechanism with its own timezone assumption would quietly undo that.
 */
export default getRequestConfig(async () => {
  const locale = await resolveLocale();

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    /**
     * A missing key is a bug in the catalogue, not something a visitor should read about.
     * Render the last segment of the key rather than next-intl's default `a.b.c` path, and
     * let the parity test fail the build instead — a gap should stop a release, not surface
     * as debug output on a marketing page.
     */
    onError() {},
    getMessageFallback({ key }) {
      return key.split(".").pop() ?? key;
    },
  };
});
