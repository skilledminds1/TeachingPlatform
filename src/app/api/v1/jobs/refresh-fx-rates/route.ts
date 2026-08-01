import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { logger } from "@/lib/observability/logger";
import { isCronAuthorized } from "@/lib/security/cron-auth";
import { getConversionContext, toUsdMinorUnits } from "@/server/fx/convert";
import { refreshFxRates } from "@/server/fx/rates";

/**
 * Refresh reference exchange rates, then re-normalise the stored ranking column.
 *
 * INT-12 stores hourlyRateUsdCents so the price filter and sort can compare like with like.
 * That value is computed at save time, so without this job it would freeze at whatever the
 * rate was on the day a teacher last edited their profile — and teachers priced in different
 * currencies would drift out of correct relative order. Refreshing rates without recomputing
 * would leave the two halves of INT-12 disagreeing.
 */
async function run(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const refresh = await refreshFxRates();
    const context = await getConversionContext();

    // Recompute in bounded batches; the marketplace is small now but this must not become a
    // single unbounded update as it grows.
    let scanned = 0;
    let updated = 0;
    let cursor: string | undefined;

    for (;;) {
      const profiles = await db.teacherProfile.findMany({
        where: { deletedAt: null },
        select: { id: true, hourlyRateCents: true, currency: true, hourlyRateUsdCents: true },
        orderBy: { id: "asc" },
        take: 200,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (profiles.length === 0) break;

      for (const profile of profiles) {
        scanned += 1;
        const normalised = toUsdMinorUnits(profile.hourlyRateCents, profile.currency, context);
        // Unknown currency, or already correct — leave it rather than writing a guess.
        if (normalised === null || normalised === profile.hourlyRateUsdCents) continue;

        await db.teacherProfile.update({
          where: { id: profile.id },
          data: { hourlyRateUsdCents: normalised },
        });
        updated += 1;
      }

      cursor = profiles[profiles.length - 1].id;
      if (profiles.length < 200) break;
    }

    const result = {
      ratesUpdated: refresh.updated,
      asOf: refresh.asOf,
      stale: refresh.stale,
      source: refresh.source,
      profilesScanned: scanned,
      profilesRenormalised: updated,
    };
    logger.info("fx_rates_refreshed", result);
    return NextResponse.json(result);
  } catch (error) {
    logger.error("refresh_fx_rates_failed", { error });
    return NextResponse.json({ error: "Job failed" }, { status: 500 });
  }
}

export const POST = run;
export const GET = run;
