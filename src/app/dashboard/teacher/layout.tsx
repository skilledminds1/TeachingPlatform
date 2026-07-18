import { redirect } from "next/navigation";

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

  return children;
}
