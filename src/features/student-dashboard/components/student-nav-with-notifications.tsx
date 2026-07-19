import { NotificationBellLoader } from "@/features/notifications/components/notification-bell-loader";
import { StudentNav } from "@/features/student-dashboard/components/student-nav";

export async function StudentNavWithNotifications() {
  return <StudentNav notificationSlot={<NotificationBellLoader />} />;
}
