"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import {
  availabilityExceptionSchema,
  weeklyAvailabilitySchema,
} from "@/lib/validations/availability";
import { requireTeacher } from "@/server/auth/session";
import { hasFeature } from "@/server/billing/entitlements";
import { fail, ok, type ActionResult } from "@/types/action";

function timeDate(time: string): Date {
  return new Date(`1970-01-01T${time}:00.000Z`);
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

  revalidatePath("/dashboard/teacher/availability");
  revalidatePath("/find-tutor");
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

  const exception = await db.availabilityException.create({
    data: {
      userId: user.id,
      specificDate,
      startTime: timeDate(parsed.data.startTime),
      endTime: timeDate(parsed.data.endTime),
      isBlocked: parsed.data.isBlocked,
    },
  });
  revalidatePath("/dashboard/teacher/availability");
  revalidatePath("/find-tutor");
  return ok({ id: exception.id });
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
  revalidatePath("/dashboard/teacher/availability");
  revalidatePath("/find-tutor");
  return ok({ deleted: true });
}
