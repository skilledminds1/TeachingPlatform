import { z } from "zod";

export const notificationPreferenceSchema = z.object({
  emailReminders: z.boolean(),
  emailMessages: z.boolean(),
  emailMarketing: z.boolean(),
});

export type NotificationPreferences = z.infer<typeof notificationPreferenceSchema>;
