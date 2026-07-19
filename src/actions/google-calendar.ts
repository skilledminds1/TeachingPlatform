"use server";

import { revalidatePath } from "next/cache";

import { requireAuth } from "@/server/auth/session";
import { deleteCalendarConnection } from "@/server/integrations/google-calendar";
import { ok, type ActionResult } from "@/types/action";

export async function disconnectGoogleCalendar(): Promise<ActionResult<{ disconnected: true }>> {
  const user = await requireAuth();
  await deleteCalendarConnection(user.id);
  revalidatePath("/dashboard/teacher/bookings");
  revalidatePath("/dashboard");
  return ok({ disconnected: true });
}
