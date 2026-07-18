import { DateTime } from "luxon";

import { db } from "@/lib/db";
import {
  LESSON_DURATION_MINUTES,
  localDateTimeToUtc,
  timeValue,
} from "@/lib/timezone";

type Window = { start: Date; end: Date };

function overlaps(a: Window, b: Window): boolean {
  return a.start < b.end && a.end > b.start;
}

export async function getAvailableSlots(
  teacherSlug: string,
  options?: { days?: number; from?: Date },
) {
  const profile = await db.teacherProfile.findFirst({
    where: { slug: teacherSlug, status: "approved", deletedAt: null },
    select: {
      userId: true,
      user: { select: { timezone: true } },
    },
  });
  if (!profile) return null;

  const days = Math.min(Math.max(options?.days ?? 14, 1), 31);
  const from = options?.from ?? new Date();
  const zone = profile.user.timezone;
  const localStart = DateTime.fromJSDate(from, { zone }).startOf("day");
  const localEnd = localStart.plus({ days });
  const rangeStart = localStart.toUTC().toJSDate();
  const rangeEnd = localEnd.toUTC().toJSDate();
  const exceptionStart = DateTime.fromISO(localStart.toISODate()!, { zone: "utc" }).toJSDate();
  const exceptionEnd = DateTime.fromISO(localEnd.toISODate()!, { zone: "utc" }).toJSDate();

  const [weekly, exceptions, bookings] = await Promise.all([
    db.availability.findMany({
      where: { userId: profile.userId },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    }),
    db.availabilityException.findMany({
      where: {
        userId: profile.userId,
        specificDate: { gte: exceptionStart, lt: exceptionEnd },
      },
      orderBy: [{ specificDate: "asc" }, { startTime: "asc" }],
    }),
    db.booking.findMany({
      where: {
        teacherId: profile.userId,
        status: { in: ["pending_payment", "confirmed"] },
        startsAt: { lt: rangeEnd },
        endsAt: { gt: rangeStart },
      },
      select: { startsAt: true, endsAt: true },
    }),
  ]);

  const now = DateTime.now().toUTC().plus({ hours: 2 });
  const results: Array<{ startsAt: string; endsAt: string; date: string }> = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset += 1) {
    const localDate = localStart.plus({ days: dayOffset });
    const date = localDate.toISODate();
    if (!date) continue;
    const dayOfWeek = localDate.weekday % 7;
    const dayExceptions = exceptions.filter(
      (item) =>
        DateTime.fromJSDate(item.specificDate, { zone: "utc" }).toISODate() === date,
    );

    const windows: Window[] = weekly
      .filter((item) => item.dayOfWeek === dayOfWeek)
      .map((item) => ({
        start: localDateTimeToUtc({ date, time: timeValue(item.startTime), timeZone: zone }),
        end: localDateTimeToUtc({ date, time: timeValue(item.endTime), timeZone: zone }),
      }));

    for (const exception of dayExceptions.filter((item) => !item.isBlocked)) {
      windows.push({
        start: localDateTimeToUtc({
          date,
          time: timeValue(exception.startTime),
          timeZone: zone,
        }),
        end: localDateTimeToUtc({
          date,
          time: timeValue(exception.endTime),
          timeZone: zone,
        }),
      });
    }

    for (const window of windows) {
      let cursor = DateTime.fromJSDate(window.start, { zone: "utc" });
      const windowEnd = DateTime.fromJSDate(window.end, { zone: "utc" });
      while (cursor.plus({ minutes: LESSON_DURATION_MINUTES }) <= windowEnd) {
        const end = cursor.plus({ minutes: LESSON_DURATION_MINUTES });
        const candidate = { start: cursor.toJSDate(), end: end.toJSDate() };
        const blocked = dayExceptions
          .filter((item) => item.isBlocked)
          .some((item) => {
            const block = {
              start: localDateTimeToUtc({
                date,
                time: timeValue(item.startTime),
                timeZone: zone,
              }),
              end: localDateTimeToUtc({
                date,
                time: timeValue(item.endTime),
                timeZone: zone,
              }),
            };
            return overlaps(candidate, block);
          });
        const booked = bookings.some((booking) => overlaps(candidate, {
          start: booking.startsAt,
          end: booking.endsAt,
        }));
        if (!blocked && !booked && cursor >= now) {
          results.push({
            startsAt: cursor.toISO()!,
            endsAt: end.toISO()!,
            date,
          });
        }
        cursor = end;
      }
    }
  }

  const unique = [...new Map(results.map((slot) => [slot.startsAt, slot])).values()];
  unique.sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return { timeZone: zone, slots: unique };
}
