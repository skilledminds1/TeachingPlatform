import { db } from "@/lib/db";
import { dateOnlyUtc, timeValue, todayInZone, zoneLabel } from "@/lib/timezone";
import { requireTeacher } from "@/server/auth/session";

/** The zone this account still carries from the pre-INT-01 column default. */
const LEGACY_DEFAULT_TIMEZONE = "Africa/Johannesburg";

export async function getTeacherSchedule() {
  const user = await requireTeacher();
  const profile = await db.teacherProfile.findUniqueOrThrow({
    where: { userId: user.id },
    select: {
      organizationId: true,
      user: { select: { timezone: true } },
    },
  });

  const timeZone = profile.user.timezone;

  const [weekly, exceptions] = await Promise.all([
    db.availability.findMany({
      where: { userId: user.id },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    }),
    db.availabilityException.findMany({
      // INT-14: this filtered `gte: new Date()` — an instant — against a date-only column
      // stored at UTC midnight, so a teacher's own blocks for today disappeared from the
      // list the moment UTC rolled past midnight. Compare against their local today.
      where: { userId: user.id, specificDate: { gte: dateOnlyUtc(todayInZone(timeZone)) } },
      orderBy: [{ specificDate: "asc" }, { startTime: "asc" }],
      take: 50,
    }),
  ]);

  return {
    user,
    organizationId: profile.organizationId,
    timeZone,
    // INT-14: the availability editor states the zone these times are in. Without it a
    // teacher who clicked through onboarding on the old SAST default cannot tell that
    // "09:00" means someone else's morning.
    timeZoneLabel: zoneLabel(timeZone),
    timeZoneIsLegacyDefault: timeZone === LEGACY_DEFAULT_TIMEZONE,
    weekly: weekly.map((slot) => ({
      id: slot.id,
      dayOfWeek: slot.dayOfWeek,
      startTime: timeValue(slot.startTime),
      endTime: timeValue(slot.endTime),
    })),
    exceptions: exceptions.map((exception) => ({
      id: exception.id,
      specificDate: exception.specificDate.toISOString().slice(0, 10),
      startTime: timeValue(exception.startTime),
      endTime: timeValue(exception.endTime),
      isBlocked: exception.isBlocked,
    })),
  };
}
