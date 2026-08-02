"use client";

import {
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  addLesson,
  addModule,
  deleteLesson,
  deleteModule,
  reorderLessons,
  reorderModules,
  updateLesson,
  updateModule,
} from "@/actions/courses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LessonMediaUploader } from "@/features/courses/components/lesson-media-uploader";

type Asset = {
  id: string;
  kind: "video" | "resource";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
};

type Lesson = {
  id: string;
  title: string;
  content: string;
  videoUrl: string | null;
  fileName: string | null;
  sortOrder: number;
  isPreview: boolean;
  assets: Asset[];
};

type Module = {
  id: string;
  title: string;
  sortOrder: number;
  lessons: Lesson[];
};

export function CourseCurriculumEditor({
  courseId,
  modules: initialModules,
}: {
  courseId: string;
  modules: Module[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [moduleTitle, setModuleTitle] = useState("");
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);
  const [lessonDrafts, setLessonDrafts] = useState<
    Record<string, { title: string; content: string }>
  >(() => {
    const drafts: Record<string, { title: string; content: string }> = {};
    for (const courseModule of initialModules) {
      for (const lesson of courseModule.lessons) {
        drafts[lesson.id] = {
          title: lesson.title,
          content: lesson.content,
        };
      }
    }
    return drafts;
  });
  const [newLessonTitles, setNewLessonTitles] = useState<Record<string, string>>({});

  function refresh(): void {
    router.refresh();
  }

  function run(action: () => Promise<{ success: boolean; error?: string }>, message: string): void {
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      toast.success(message);
      refresh();
    });
  }

  function moveModule(moduleId: string, direction: -1 | 1): void {
    const index = initialModules.findIndex((item) => item.id === moduleId);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= initialModules.length) return;
    const next = [...initialModules];
    const [item] = next.splice(index, 1);
    next.splice(swapIndex, 0, item);
    run(
      () => reorderModules({ courseId, moduleIds: next.map((entry) => entry.id) }),
      "Module order updated.",
    );
  }

  function moveLesson(moduleId: string, lessonId: string, direction: -1 | 1): void {
    const courseModule = initialModules.find((item) => item.id === moduleId);
    if (!courseModule) return;
    const index = courseModule.lessons.findIndex((lesson) => lesson.id === lessonId);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= courseModule.lessons.length) return;
    const next = [...courseModule.lessons];
    const [item] = next.splice(index, 1);
    next.splice(swapIndex, 0, item);
    run(
      () => reorderLessons({ moduleId, lessonIds: next.map((lesson) => lesson.id) }),
      "Lesson order updated.",
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-2xl font-semibold tracking-tight">Curriculum</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Organize sections and lectures. Add a private video and downloadable resources to each
          lesson.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={moduleTitle}
          onChange={(event) => setModuleTitle(event.target.value)}
          placeholder="New section title"
          aria-label="New section title"
        />
        <Button
          type="button"
          disabled={isPending || !moduleTitle.trim()}
          onClick={() => {
            const title = moduleTitle.trim();
            run(async () => {
              const result = await addModule({ courseId, title });
              if (result.success) setModuleTitle("");
              return result;
            }, "Section added.");
          }}
        >
          <Plus className="size-4" aria-hidden />
          Add section
        </Button>
      </div>

      {initialModules.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No sections yet. Create one to start adding lectures.
        </p>
      ) : (
        <ul className="space-y-4">
          {initialModules.map((module, moduleIndex) => (
            <li key={module.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1 space-y-2">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Section {moduleIndex + 1}
                  </p>
                  <Input
                    defaultValue={module.title}
                    aria-label={`Section ${moduleIndex + 1} title`}
                    onBlur={(event) => {
                      const title = event.target.value.trim();
                      if (!title || title === module.title) return;
                      run(() => updateModule({ moduleId: module.id, title }), "Section updated.");
                    }}
                  />
                </div>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={isPending || moduleIndex === 0}
                    onClick={() => moveModule(module.id, -1)}
                    aria-label="Move section up"
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={isPending || moduleIndex === initialModules.length - 1}
                    onClick={() => moveModule(module.id, 1)}
                    aria-label="Move section down"
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => {
                      if (!window.confirm("Delete this section and all of its lessons?")) return;
                      run(() => deleteModule({ moduleId: module.id }), "Section deleted.");
                    }}
                    aria-label="Delete section"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              <ul className="mt-4 space-y-3 border-s border-border ps-4">
                {module.lessons.map((lesson, lessonIndex) => {
                  const draft = lessonDrafts[lesson.id] ?? {
                    title: lesson.title,
                    content: lesson.content,
                  };
                  const expanded = expandedLessonId === lesson.id;
                  const video =
                    lesson.assets.find((asset) => asset.kind === "video") ?? null;
                  const resources = lesson.assets.filter((asset) => asset.kind === "resource");
                  return (
                    <li key={lesson.id} className="space-y-2 rounded-lg bg-muted/30 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <button
                          type="button"
                          className="text-start text-sm font-medium hover:underline"
                          onClick={() =>
                            setExpandedLessonId(expanded ? null : lesson.id)
                          }
                        >
                          Lecture {lessonIndex + 1}. {lesson.title}
                          {lesson.isPreview ? (
                            <span className="ms-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                              Preview
                            </span>
                          ) : null}
                          {video ? (
                            <span className="ms-2 text-xs font-normal text-muted-foreground">
                              · video
                            </span>
                          ) : null}
                          {resources.length > 0 ? (
                            <span className="ms-2 text-xs font-normal text-muted-foreground">
                              · {resources.length} resource
                              {resources.length === 1 ? "" : "s"}
                            </span>
                          ) : null}
                        </button>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            disabled={isPending || lessonIndex === 0}
                            onClick={() => moveLesson(module.id, lesson.id, -1)}
                            aria-label="Move lecture up"
                          >
                            <ChevronUp className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            disabled={
                              isPending || lessonIndex === module.lessons.length - 1
                            }
                            onClick={() => moveLesson(module.id, lesson.id, 1)}
                            aria-label="Move lecture down"
                          >
                            <ChevronDown className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            disabled={isPending}
                            onClick={() => {
                              if (!window.confirm("Delete this lecture?")) return;
                              run(
                                () => deleteLesson({ lessonId: lesson.id }),
                                "Lecture deleted.",
                              );
                            }}
                            aria-label="Delete lecture"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>

                      {expanded ? (
                        <div className="space-y-4 pt-1">
                          <Input
                            value={draft.title}
                            onChange={(event) =>
                              setLessonDrafts((current) => ({
                                ...current,
                                [lesson.id]: { ...draft, title: event.target.value },
                              }))
                            }
                            aria-label="Lecture title"
                          />
                          <Textarea
                            value={draft.content}
                            onChange={(event) =>
                              setLessonDrafts((current) => ({
                                ...current,
                                [lesson.id]: { ...draft, content: event.target.value },
                              }))
                            }
                            placeholder="Lecture notes or written content"
                            aria-label="Lecture content"
                          />
                          <Button
                            type="button"
                            size="sm"
                            disabled={isPending}
                            onClick={() =>
                              run(
                                () =>
                                  updateLesson({
                                    lessonId: lesson.id,
                                    title: draft.title.trim(),
                                    content: draft.content,
                                  }),
                                "Lecture saved.",
                              )
                            }
                          >
                            Save lecture
                          </Button>
                          <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
                            <input
                              type="checkbox"
                              className="mt-0.5 size-4"
                              checked={lesson.isPreview}
                              disabled={isPending}
                              onChange={(event) =>
                                run(
                                  () =>
                                    updateLesson({
                                      lessonId: lesson.id,
                                      isPreview: event.target.checked,
                                    }),
                                  event.target.checked
                                    ? "Lesson is now a free preview."
                                    : "Lesson preview removed.",
                                )
                              }
                            />
                            <span>
                              <span className="font-medium">Free preview lesson</span>
                              <span className="block text-xs text-muted-foreground">
                                Public visitors can watch/read this lesson and download its resources.
                                Maximum 3 previews; at least one lesson must remain private.
                              </span>
                            </span>
                          </label>
                          <LessonMediaUploader
                            lessonId={lesson.id}
                            video={video}
                            resources={resources}
                            onChanged={refresh}
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={newLessonTitles[module.id] ?? ""}
                  onChange={(event) =>
                    setNewLessonTitles((current) => ({
                      ...current,
                      [module.id]: event.target.value,
                    }))
                  }
                  placeholder="New lecture title"
                  aria-label={`New lecture for section ${moduleIndex + 1}`}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending || !(newLessonTitles[module.id] ?? "").trim()}
                  onClick={() => {
                    const title = (newLessonTitles[module.id] ?? "").trim();
                    run(async () => {
                      const result = await addLesson({ moduleId: module.id, title });
                      if (result.success) {
                        setNewLessonTitles((current) => ({ ...current, [module.id]: "" }));
                      }
                      return result;
                    }, "Lecture added.");
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  Add lecture
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
