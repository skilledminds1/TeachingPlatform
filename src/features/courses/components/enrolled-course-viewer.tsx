"use client";

import { CheckCircle2, Circle, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { getLessonFileSignedUrl, markLessonComplete } from "@/actions/courses";
import { Button } from "@/components/ui/button";
import { formatCourseLevel } from "@/features/courses/lib/labels";
import type { CourseLevel } from "@prisma/client";

type Lesson = {
  id: string;
  title: string;
  content: string;
  videoUrl: string | null;
  fileName: string | null;
  fileMimeType: string | null;
  sortOrder: number;
  progress: Array<{ completedAt: Date | string | null }>;
};

type Module = {
  id: string;
  title: string;
  sortOrder: number;
  lessons: Lesson[];
};

export function EnrolledCourseViewer({
  course,
}: {
  course: {
    id: string;
    title: string;
    description: string;
    level: CourseLevel;
    teacher: { name: string };
    modules: Module[];
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const firstLessonId = course.modules.flatMap((module) => module.lessons)[0]?.id ?? null;
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(firstLessonId);

  const lessons = useMemo(
    () => course.modules.flatMap((module) => module.lessons.map((lesson) => ({ ...lesson, moduleTitle: module.title }))),
    [course.modules],
  );

  const selected = lessons.find((lesson) => lesson.id === selectedLessonId) ?? null;
  const completedCount = lessons.filter((lesson) =>
    lesson.progress.some((item) => item.completedAt),
  ).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div>
          <p className="text-xs text-muted-foreground">
            {completedCount} / {lessons.length} lessons complete
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{
                width: lessons.length
                  ? `${Math.round((completedCount / lessons.length) * 100)}%`
                  : "0%",
              }}
            />
          </div>
        </div>

        <nav className="space-y-4" aria-label="Course curriculum">
          {course.modules.map((module) => (
            <div key={module.id} className="space-y-1.5">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {module.title}
              </p>
              <ul className="space-y-1">
                {module.lessons.map((lesson) => {
                  const complete = lesson.progress.some((item) => item.completedAt);
                  const active = lesson.id === selectedLessonId;
                  return (
                    <li key={lesson.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedLessonId(lesson.id)}
                        className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                          active
                            ? "bg-primary/10 text-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        {complete ? (
                          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                        ) : (
                          <Circle className="mt-0.5 size-3.5 shrink-0" />
                        )}
                        <span>{lesson.title}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <section className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-sm">
        {!selected ? (
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">{course.title}</h1>
            <p className="text-sm text-muted-foreground">
              {formatCourseLevel(course.level)} · {course.teacher.name}
            </p>
            <p className="text-sm text-muted-foreground">{course.description}</p>
            <p className="pt-4 text-sm text-muted-foreground">
              Select a lesson from the curriculum to begin.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{selected.moduleTitle}</p>
              <h1 className="text-2xl font-semibold tracking-tight">{selected.title}</h1>
            </div>

            {selected.videoUrl ? (
              <div className="aspect-video overflow-hidden rounded-lg border border-border bg-muted">
                <iframe
                  src={selected.videoUrl}
                  title={selected.title}
                  className="size-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : null}

            {selected.content ? (
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-foreground">
                {selected.content}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No written content for this lesson.</p>
            )}

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {selected.fileName ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await getLessonFileSignedUrl({ lessonId: selected.id });
                      if (!result.success) {
                        toast.error(result.error);
                        return;
                      }
                      window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
                    });
                  }}
                >
                  <Download className="size-4" aria-hidden />
                  Download {selected.fileName}
                </Button>
              ) : null}

              {selected.progress.some((item) => item.completedAt) ? (
                <Button type="button" variant="secondary" disabled>
                  <CheckCircle2 className="size-4" aria-hidden />
                  Completed
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await markLessonComplete({ lessonId: selected.id });
                      if (!result.success) {
                        toast.error(result.error);
                        return;
                      }
                      toast.success("Lesson marked complete.");
                      router.refresh();
                    });
                  }}
                >
                  Mark complete
                </Button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
