import { BookOpen, ClipboardCheck } from "lucide-react";
import Link from "next/link";

import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { CourseModerationActions } from "@/features/admin/components/course-moderation-actions";
import { EmptyState } from "@/features/admin/components/empty-state";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { formatCourseLevel } from "@/features/courses/lib/labels";
import { formatCurrency, formatDate, formatStatus } from "@/lib/format";
import { getCourseModerationQueue } from "@/server/courses/queries";

export default async function AdminCoursesPage() {
  const courses = await getCourseModerationQueue();

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <AdminPageHeader
        title="Course approvals"
        description={`${courses.length} course${courses.length === 1 ? "" : "s"} waiting for review`}
      />

      {courses.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <EmptyState
            icon={ClipboardCheck}
            title="No courses pending review"
            description="Submitted courses will appear here before they go live on the marketplace."
          />
        </div>
      ) : (
        <div className="space-y-4">
          {courses.map((course) => (
            <article
              key={course.id}
              className="rounded-xl border border-border bg-card p-5 shadow-sm md:p-6"
            >
              <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-lg font-semibold tracking-tight">{course.title}</h2>
                    <StatusBadge tone={statusTone(course.status)}>
                      {formatStatus(course.status)}
                    </StatusBadge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {course.teacher.name} · {course.teacher.email}
                    {course.subject ? ` · ${course.subject.name}` : ""} ·{" "}
                    {formatCourseLevel(course.level)} ·{" "}
                    {formatCurrency(course.priceCents, course.currency)}
                  </p>
                  <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                    {course.description || "No description provided."}
                  </p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="size-3.5" aria-hidden />
                      {course._count.modules} modules
                    </span>
                    <span>
                      Submitted{" "}
                      {course.submittedAt ? formatDate(course.submittedAt) : "recently"}
                    </span>
                    {course.certificateEnabled ? <span>Certificate enabled</span> : null}
                  </div>
                  <Link
                    href={`/admin/courses/${course.id}`}
                    className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Review curriculum and media
                  </Link>
                </div>
                <CourseModerationActions
                  courseId={course.id}
                  currentStatus={course.status}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
