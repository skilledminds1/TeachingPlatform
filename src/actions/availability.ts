"use server";

import { revalidatePath } from "next/cache";
import { DateTime } from "luxon";

import { db } from "@/lib/db";
import { localDateTimeToUtc } from "@/lib/timezone";
import {
  availabilityExceptionRangeSchema,
  availabilityExceptionSchema,
  weeklyAvailabilitySchema,
} from "@/lib/validations/availability";
import { findLessonConflictsForRange } from "@/server/availability/conflicts";
import { requireTeacher } from "@/server/auth/session";
import { hasFeature } from "@/server/billing/entitlements";
import { fail, ok, type ActionResult } from "@/types/action";

function timeDate(time: string): Date {
  return new Date(`1970-01-01T${time}:00.000Z`);
}

function revalidateCalendarPaths(): void {
  revalidatePath("/dashboard/teacher/availability");
  revalidatePath("/dashboard/teacher/bookings");
  revalidatePath("/find-tutor");
}

export async function saveWeeklyAvailability(
  input: unknown,
): Promise<ActionResult<{ saved: number }>> {
  const parsed = weeklyAvailabilitySchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid schedule.", "VALIDATION_ERROR");
  }
  const user = await requireTeacher();

  for (const [index, slot] of parsed.data.slots.entries()) {
    const overlap = parsed.data.slots.some(
      (other, otherIndex) =>
        index !== otherIndex &&
        slot.dayOfWeek === other.dayOfWeek &&
        slot.startTime < other.endTime &&
        slot.endTime > other.startTime,
    );
    if (overlap) {
      return fail("Availability windows on the same day cannot overlap.", "VALIDATION_ERROR");
    }
  }

  await db.$transaction([
    db.availability.deleteMany({ where: { userId: user.id } }),
    db.availability.createMany({
      data: parsed.data.slots.map((slot) => ({
        userId: user.id,
        dayOfWeek: slot.dayOfWeek,
        startTime: timeDate(slot.startTime),
        endTime: timeDate(slot.endTime),
      })),
    }),
  ]);

  revalidateCalendarPaths();
  return ok({ saved: parsed.data.slots.length });
}

export async function addAvailabilityException(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = availabilityExceptionSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid exception.", "VALIDATION_ERROR");
  }
  const user = await requireTeacher();
  const profile = await db.teacherProfile.findUniqueOrThrow({
    where: { userId: user.id },
    select: { organizationId: true },
  });
  if (!(await hasFeature(profile.organizationId, "custom_availability"))) {
    return fail(
      "Blocked dates and extra hours are available on Starter and above.",
      "PLAN_LIMIT_EXCEEDED",
    );
  }

  const specificDate = new Date(`${parsed.data.specificDate}T00:00:00.000Z`);
  if (specificDate < new Date(new Date().toISOString().slice(0, 10))) {
    return fail("Exceptions must be today or later.", "VALIDATION_ERROR");
  }

  if (parsed.data.isBlocked) {
    const start = localDateTimeToUtc({
      date: parsed.data.specificDate,
      time: parsed.data.startTime,
      timeZone: user.timezone,
    });
    const end = localDateTimeToUtc({
      date: parsed.data.specificDate,
      time: parsed.data.endTime,
      timeZone: user.timezone,
    });
    const conflicts = await findLessonConflictsForRange({
      teacherId: user.id,
      start,
      end,
    });
    if (conflicts.length > 0) {
      return fail(
        "You have lessons booked during this time off. Message students to reschedule first.",
        "CONFLICT",
        { conflicts },
      );
    }
  }

  const exception = await db.availabilityException.create({
    data: {
      userId: user.id,
      specificDate,
      startTime: timeDate(parsed.data.startTime),
      endTime: timeDate(parsed.data.endTime),
      isBlocked: parsed.data.isBlocked,
      title: parsed.data.title?.trim() || null,
    },
  });
  revalidateCalendarPaths();
  return ok({ id: exception.id });
}

export async function addAvailabilityExceptionRange(
  input: unknown,
): Promise<ActionResult<{ ids: string[] }>> {
  const parsed = availabilityExceptionRangeSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid exception.", "VALIDATION_ERROR");
  }
  const user = await requireTeacher();
  const profile = await db.teacherProfile.findUniqueOrThrow({
    where: { userId: user.id },
    select: { organizationId: true },
  });
  if (!(await hasFeature(profile.organizationId, "custom_availability"))) {
    return fail(
      "Blocked dates and extra hours are available on Starter and above.",
      "PLAN_LIMIT_EXCEEDED",
    );
  }

  const start = DateTime.fromISO(parsed.data.startDate, { zone: "utc" }).startOf("day");
  const end = DateTime.fromISO(parsed.data.endDate, { zone: "utc" }).startOf("day");
  if (!start.isValid || !end.isValid) {
    return fail("Invalid date range.", "VALIDATION_ERROR");
  }
  if (start < DateTime.utc().startOf("day")) {
    return fail("You can't create a time slot in the past.", "VALIDATION_ERROR");
  }

  const allDay = parsed.data.allDay === true;
  const title = parsed.data.title?.trim() || (parsed.data.isBlocked ? "Busy" : null);

  if (parsed.data.isBlocked) {
    const rangeStart = localDateTimeToUtc({
      date: parsed.data.startDate,
      time: allDay ? "00:00" : parsed.data.startTime,
      timeZone: user.timezone,
    });
    const rangeEnd = localDateTimeToUtc({
      date: parsed.data.endDate,
      time: allDay ? "23:59" : parsed.data.endTime,
      timeZone: user.timezone,
    });
    const conflicts = await findLessonConflictsForRange({
      teacherId: user.id,
      start: rangeStart,
      end: rangeEnd,
    });
    if (conflicts.length > 0) {
      return fail(
        "You have lessons booked during this time off. Message students to reschedule first.",
        "CONFLICT",
        { conflicts },
      );
    }
  }

  const ids: string[] = [];

  for (let cursor = start; cursor <= end; cursor = cursor.plus({ days: 1 })) {
    const isFirst = cursor.hasSame(start, "day");
    const isLast = cursor.hasSame(end, "day");
    const dayStart = allDay ? "00:00" : isFirst ? parsed.data.startTime : "00:00";
    const dayEnd = allDay ? "23:59" : isLast ? parsed.data.endTime : "23:59";
    if (dayStart >= dayEnd && !allDay && isFirst && isLast) {
      return fail("End must be after start.", "VALIDATION_ERROR");
    }

    const exception = await db.availabilityException.create({
      data: {
        userId: user.id,
        specificDate: cursor.toJSDate(),
        startTime: timeDate(dayStart),
        endTime: timeDate(dayEnd === "23:59" && allDay ? "23:59" : dayEnd),
        isBlocked: parsed.data.isBlocked,
        title,
      },
    });
    ids.push(exception.id);
  }

  revalidateCalendarPaths();
  return ok({ ids });
}

export async function deleteAvailabilityException(
  id: string,
): Promise<ActionResult<{ deleted: true }>> {
  const user = await requireTeacher();
  const exception = await db.availabilityException.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!exception) return fail("Availability exception not found.", "NOT_FOUND");
  await db.availabilityException.delete({ where: { id: exception.id } });
  revalidateCalendarPaths();
  return ok({ deleted: true });
}
