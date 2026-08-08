"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireTeacher } from "@/server/auth/session";
import { fail, ok, type ActionResult } from "@/types/action";

const autoAcceptSchema = z.object({ enabled: z.boolean() });

/**
 * Opt in to confirming booking requests automatically.
 *
 * Off by default, and deliberately so: accepting a lesson is a commitment to be somewhere at a
 * time, and a teacher who has not opted in should not be committed by a stranger's click.
 */
export async function setAutoAcceptBookings(
  input: unknown,
): Promise<ActionResult<{ enabled: boolean }>> {
  const parsed = autoAcceptSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid setting.", "VALIDATION_ERROR");

  const teacher = await requireTeacher();
  const updated = await db.teacherProfile.updateMany({
    where: { userId: teacher.id },
    data: { autoAcceptBookings: parsed.data.enabled },
  });
  if (updated.count === 0) return fail("Teacher profile not found.", "NOT_FOUND");

  revalidatePath("/dashboard/teacher/settings");
  revalidatePath("/dashboard/teacher");
  return ok({ enabled: parsed.data.enabled });
}
