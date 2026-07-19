import { z } from "zod";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm time format.");

export const weeklyAvailabilitySchema = z.object({
  slots: z
    .array(
      z
        .object({
          dayOfWeek: z.number().int().min(0).max(6),
          startTime: time,
          endTime: time,
        })
        .refine((slot) => slot.startTime < slot.endTime, {
          message: "End time must be after start time.",
        }),
    )
    .max(35),
});

export const availabilityExceptionSchema = z
  .object({
    specificDate: z.iso.date(),
    startTime: time,
    endTime: time,
    isBlocked: z.boolean(),
    title: z.string().trim().max(80).optional(),
  })
  .refine((slot) => slot.startTime < slot.endTime, {
    message: "End time must be after start time.",
  });

export const availabilityExceptionRangeSchema = z
  .object({
    startDate: z.iso.date(),
    startTime: time,
    endDate: z.iso.date(),
    endTime: time,
    isBlocked: z.boolean(),
    title: z.string().trim().max(80).optional(),
    allDay: z.boolean().optional(),
  })
  .refine((slot) => {
    if (slot.startDate < slot.endDate) return true;
    if (slot.startDate > slot.endDate) return false;
    return slot.startTime < slot.endTime;
  }, {
    message: "End must be after start.",
  });
