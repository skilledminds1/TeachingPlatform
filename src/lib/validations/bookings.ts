import { z } from "zod";

export const createBookingSchema = z.object({
  teacherSlug: z.string().trim().min(1).max(120),
  startsAt: z.iso.datetime(),
});

export const scheduleLessonAsTeacherSchema = z.object({
  studentId: z.uuid(),
  startsAt: z.iso.datetime(),
});

export const cancelBookingSchema = z.object({
  bookingId: z.uuid(),
  reason: z.string().trim().min(3).max(500),
});

export const proposeBookingRescheduleSchema = z.object({
  bookingId: z.uuid(),
  startsAt: z.iso.datetime(),
  reason: z.string().trim().max(500).optional(),
});

export const respondBookingRescheduleSchema = z.object({
  proposalId: z.uuid(),
});
