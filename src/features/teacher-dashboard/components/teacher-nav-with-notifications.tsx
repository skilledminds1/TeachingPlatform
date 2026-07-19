import { NotificationBellLoader } from "@/features/notifications/components/notification-bell-loader";
import { TeacherNav } from "@/features/teacher-dashboard/components/teacher-nav";

export async function TeacherNavWithNotifications() {
  return <TeacherNav notificationSlot={<NotificationBellLoader />} />;
}
