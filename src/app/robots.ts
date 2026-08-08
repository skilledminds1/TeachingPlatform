import type { MetadataRoute } from "next";

import { env } from "@/lib/env";

/**
 * Crawl directives (GLO-02).
 *
 * There were none. Worse than none, in fact: `/robots.txt` was not excluded from the auth
 * middleware, so it answered `307 → /login` in production — a crawler asking what it may
 * read was handed a sign-in page.
 *
 * Disallow is scoped to what a crawler must never index rather than to everything private.
 * Authenticated areas already redirect, so listing them is belt-and-braces; the entries that
 * matter are the ones that would otherwise be indexed and should not be:
 *
 *   /auth/          — callback URLs carrying single-use codes.
 *   /api/           — never useful in an index, and some routes are expensive.
 *
 * `/teachers` and `/teachers/*` are the legacy aliases that permanently redirect to
 * `/find-tutor`. They stay crawlable on purpose: blocking them would stop crawlers ever
 * seeing the 308 and transferring the accumulated signal to the canonical path.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/dashboard/",
          "/auth/",
          "/login",
          "/register",
          "/forgot-password",
          "/reset-password",
          "/legal-review",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
