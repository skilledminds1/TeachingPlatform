import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { CourseModerationActions } from "@/features/admin/components/course-moderation-actions";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { AdminCourseMediaPreview } from "@/features/admin/components/admin-course-media-preview";
import { CourseQuestionModeration } from "@/features/admin/components/course-question-moderation";
import { formatCourseLevel } from "@/features/courses/lib/labels";
import { formatCurrency, formatStatus } from "@/lib/format";
import { getCourseForAdminReview } from "@/server/courses/queries";

export default async function AdminCourseReviewPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const course = await getCourseForAdminReview(courseId);
  if (!course) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" render={<Link href="/admin/courses" />}>
          <ArrowLeft className="size-4" aria-hidden />
          Back to queue
        </Button>
        <CourseModerationActions courseId={course.id} currentStatus={course.status} />
      </div>

      <AdminPageHeader
        title={course.title}
        description={`${course.teacher.name} · ${formatCourseLevel(course.level)} · ${formatCurrency(course.priceCents, course.currency)}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={statusTone(course.status)}>
          {formatStatus(course.status)}
        </StatusBadge>
        {course.certificateEnabled ? (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs">Certificate enabled</span>
        ) : null}
        {course.subject ? (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs">{course.subject.name}</span>
        ) : null}
      </div>

      {course.coverImageUrl ? (
        <div className="aspect-video max-w-xl overflow-hidden rounded-xl border border-border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={course.coverImageUrl} alt="" className="size-full object-cover" />
        </div>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="font-semibold">Description</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {course.description || "No description provided."}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold">Curriculum</h2>
        {course.modules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No modules yet.</p>
        ) : (
          <ul className="space-y-4">
            {course.modules.map((module, moduleIndex) => (
              <li key={module.id} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Section {moduleIndex + 1}
                </p>
                <h3 className="mt-1 font-medium">{module.title}</h3>
                <ul className="mt-4 space-y-4">
                  {module.lessons.map((lesson, lessonIndex) => (
                    <li key={lesson.id} className="rounded-lg border border-border/70 p-4">
                      <p className="text-sm font-medium">
                        Lecture {lessonIndex + 1}. {lesson.title}
                      </p>
                      {lesson.content ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                          {lesson.content}
                        </p>
                      ) : null}
                      <AdminCourseMediaPreview assets={lesson.assets} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      {course.questions.length > 0 ? (
        <section className="space-y-4">
          <h2 className="font-semibold">Course Q&amp;A moderation</h2>
          {course.questions.map((question) => (
            <article key={question.id} className="rounded-xl border border-border bg-card p-4 text-sm">
              <p className="font-medium">{question.body}</p>
              {question.answer ? (
                <p className="mt-2 text-muted-foreground">Answer: {question.answer.body}</p>
              ) : null}
              <div className="mt-3">
                <CourseQuestionModeration questionId={question.id} hidden={question.hidden} />
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
