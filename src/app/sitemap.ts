import type { MetadataRoute } from "next";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/observability/logger";
import { PUBLIC_TEACHER_WHERE } from "@/server/marketplace/teachers";

/**
 * URL inventory for crawlers (GLO-02).
 *
 * Teacher profiles were reachable only by following internal links from the marketplace,
 * which is the slowest possible way for them to be discovered and the easiest for them to
 * be missed.
 *
 * EVERY URL HERE IS THE CANONICAL ONE. `/teachers/[slug]` permanently redirects to
 * `/find-tutor/[slug]`, and `/teachers` to `/find-tutor` — listing the legacy paths would
 * fill the sitemap with 308s, which is a well-known way to waste crawl budget and dilute the
 * signal you were trying to concentrate. The rows come from the same visibility predicates
 * the marketplace itself uses, so a profile the catalog hides can never be advertised here.
 */

/** Revalidate hourly. The content changes on teacher approval, not on request. */
export const revalidate = 3600;

/**
 * Static public paths, canonical form only.
 *
 * `/teachers` is deliberately absent — it is the redirecting alias of `/find-tutor`.
 */
const STATIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" | "yearly" }> = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" },
  { path: "/find-tutor", priority: 0.9, changeFrequency: "daily" },
  { path: "/subscribe", priority: 0.5, changeFrequency: "monthly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/refund-policy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/teacher-agreement", priority: 0.3, changeFrequency: "yearly" },
  { path: "/accessibility", priority: 0.3, changeFrequency: "yearly" },
];

/**
 * Google rejects a sitemap above 50,000 URLs. Well beyond current supply, but a marketplace
 * is supposed to outgrow this — at which point the answer is a sitemap index, not a bigger
 * file. Capped and logged rather than silently truncated, so the day it matters is visible.
 */
const MAX_URLS_PER_TYPE = 20_000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  try {
    const teachers = await db.teacherProfile.findMany({
      where: PUBLIC_TEACHER_WHERE,
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: MAX_URLS_PER_TYPE,
    });

    if (teachers.length === MAX_URLS_PER_TYPE) {
      logger.warn("sitemap_truncated", {
        teachers: teachers.length,
        limit: MAX_URLS_PER_TYPE,
      });
    }

    return [
      ...staticEntries,
      ...teachers.map((teacher) => ({
        url: `${baseUrl}/find-tutor/${teacher.slug}`,
        lastModified: teacher.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ];
  } catch (error) {
    // A sitemap is a discovery aid, not a page anyone waits on. If the database is
    // unreachable, serve the static routes rather than failing the build or returning a 500
    // — a partial sitemap is strictly better than none, and the alternative is that one slow
    // query takes the whole deployment down.
    logger.error("sitemap_dynamic_entries_failed", { error });
    return staticEntries;
  }
}
