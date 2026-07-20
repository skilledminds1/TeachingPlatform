import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { logger } from "@/lib/observability/logger";
import { isCronAuthorized } from "@/lib/security/cron-auth";
import { notifySessionReminder } from "@/server/notifications/notify";

/**
 * Cron-friendly reminder job. Call every 15 minutes:
 * GET /api/v1/jobs/session-reminders
 *
 * Sends in-app + email reminders for confirmed lessons starting in 45–75 minutes.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = Date.now();
  const windowStart = new Date(now + 45 * 60_000);
  const windowEnd = new Date(now + 75 * 60_000);

  const bookings = await db.booking.findMany({
    where: {
      status: "confirmed",
      startsAt: { gte: windowStart, lte: windowEnd },
      videoSession: { isNot: null },
    },
    select: { id: true },
  });

  let sent = 0;
  for (const booking of bookings) {
    const alreadySent = await db.notification.findFirst({
      where: {
        type: "session.reminder",
        metadata: { path: ["bookingId"], equals: booking.id },
      },
      select: { id: true },
    });
    if (alreadySent) continue;
    try {
      await notifySessionReminder(booking.id);
      sent += 1;
    } catch (error) {
      logger.error("session_reminder_failed", { error, bookingId: booking.id });
    }
  }

  return NextResponse.json({ ok: true, candidates: bookings.length, sent });
}
