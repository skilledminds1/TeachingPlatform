import { z } from "zod";

export const createBookingSchema = z.object({
  teacherSlug: z.string().trim().min(1).max(120),
  startsAt: z.iso.datetime(),
});

export const cancelBookingSchema = z.object({
  bookingId: z.uuid(),
  reason: z.string().trim().min(3).max(500),
});
