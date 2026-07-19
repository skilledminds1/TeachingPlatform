import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { EnrolledCourseViewer } from "@/features/courses/components/enrolled-course-viewer";
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
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-6">
          <Button variant="ghost" render={<Link href="/dashboard/courses" />}>
            <ArrowLeft className="size-4" aria-hidden />
            My courses
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <EnrolledCourseViewer course={course} />
      </main>
    </div>
  );
}
