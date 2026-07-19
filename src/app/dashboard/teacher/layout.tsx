import { redirect } from "next/navigation";

import { TeacherNavWithNotifications } from "@/features/teacher-dashboard/components/teacher-nav-with-notifications";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import {
  getCurrentUser,
  getPostAuthRedirect,
  requireTeacher,
} from "@/server/auth/session";

export default async function TeacherDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requireTeacher();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect("/login?redirect=/dashboard/teacher");
    }
    if (error instanceof ForbiddenError) {
      const user = await getCurrentUser();
      redirect(user ? await getPostAuthRedirect(user) : "/dashboard");
    }
    throw error;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <TeacherNavWithNotifications />
      <main>{children}</main>
    </div>
  );
}
