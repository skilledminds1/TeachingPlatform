import { db } from "@/lib/db";
import type { NotificationPreferences } from "@/lib/validations/notification-preferences";

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  emailReminders: true,
  emailMessages: false,
  emailMarketing: false,
};

/**
 * Read a user's notification preferences.
 *
 * This is a plain server module, deliberately NOT a "use server" file. It previously lived
 * in src/actions/notification-preferences.ts, where the file-level "use server" turned every
 * export into a publicly callable RPC endpoint — so `getNotificationPreferences(userId)`
 * accepted any caller-supplied id with no auth check and returned that user's row to anyone
 * who scraped the action id from the client bundle.
 *
 * Call sites pass the *session* user's id. Anything reachable by an untrusted caller belongs
 * in an action with its own requireAuth().
 */
export async function getNotificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  const preference = await db.userNotificationPreference.findUnique({
    where: { userId },
    select: {
      emailReminders: true,
      emailMessages: true,
      emailMarketing: true,
    },
  });
  return preference ?? DEFAULT_NOTIFICATION_PREFERENCES;
}
