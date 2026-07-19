import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { EnrolledCourseViewer } from "@/features/courses/components/enrolled-course-viewer";
import { StudentNavWithNotifications } from "@/features/student-dashboard/components/student-nav-with-notifications";
import { getCurrentUser } from "@/server/auth/session";
import { getEnrolledCourseDetail } from "@/server/courses/queries";

export const metadata: Metadata = { title: "Course" };

export default async function StudentCourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?redirect=/dashboard/courses/${courseId}`);

  const course = await getEnrolledCourseDetail(courseId, user.id);
  if (!course) notFound();

  return (
    <div className="min-h-screen bg-muted/20">
      <StudentNavWithNotifications />

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <EnrolledCourseViewer course={course} />
      </main>
    </div>
  );
}
