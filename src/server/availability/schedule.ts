import { db } from "@/lib/db";
import { timeValue } from "@/lib/timezone";
import { requireTeacher } from "@/server/auth/session";

export async function getTeacherSchedule() {
  const user = await requireTeacher();
  const profile = await db.teacherProfile.findUniqueOrThrow({
    where: { userId: user.id },
    select: {
      organizationId: true,
      user: { select: { timezone: true } },
    },
  });

  const [weekly, exceptions] = await Promise.all([
    db.availability.findMany({
      where: { userId: user.id },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    }),
    db.availabilityException.findMany({
      where: { userId: user.id, specificDate: { gte: new Date() } },
      orderBy: [{ specificDate: "asc" }, { startTime: "asc" }],
      take: 50,
    }),
  ]);

  return {
    user,
    organizationId: profile.organizationId,
    timeZone: profile.user.timezone,
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
