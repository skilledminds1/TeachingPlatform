"use client";

import {
  ChevronDown,
  ChevronUp,
  FileUp,
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
  uploadLessonFile,
} from "@/actions/courses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Lesson = {
  id: string;
  title: string;
  content: string;
  videoUrl: string | null;
  fileName: string | null;
  sortOrder: number;
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
    Record<string, { title: string; content: string; videoUrl: string }>
  >(() => {
    const drafts: Record<string, { title: string; content: string; videoUrl: string }> = {};
    for (const courseModule of initialModules) {
      for (const lesson of courseModule.lessons) {
        drafts[lesson.id] = {
          title: lesson.title,
          content: lesson.content,
          videoUrl: lesson.videoUrl ?? "",
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
    <div className="space-y-5 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Curriculum</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add modules and lessons. Publish requires at least one lesson.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={moduleTitle}
          onChange={(event) => setModuleTitle(event.target.value)}
          placeholder="New module title"
          aria-label="New module title"
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
            }, "Module added.");
          }}
        >
          <Plus className="size-4" aria-hidden />
          Add module
        </Button>
      </div>

      {initialModules.length === 0 ? (
        <p className="text-sm text-muted-foreground">No modules yet. Create one to get started.</p>
      ) : (
        <ul className="space-y-4">
          {initialModules.map((module, moduleIndex) => (
            <li key={module.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex-1 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Module {moduleIndex + 1}
                  </p>
                  <Input
                    defaultValue={module.title}
                    aria-label={`Module ${moduleIndex + 1} title`}
                    onBlur={(event) => {
                      const title = event.target.value.trim();
                      if (!title || title === module.title) return;
                      run(() => updateModule({ moduleId: module.id, title }), "Module updated.");
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
                    aria-label="Move module up"
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={isPending || moduleIndex === initialModules.length - 1}
                    onClick={() => moveModule(module.id, 1)}
                    aria-label="Move module down"
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() => {
                      if (!window.confirm("Delete this module and all of its lessons?")) return;
                      run(() => deleteModule({ moduleId: module.id }), "Module deleted.");
                    }}
                    aria-label="Delete module"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              <ul className="mt-4 space-y-3 border-l border-border pl-4">
                {module.lessons.map((lesson, lessonIndex) => {
                  const draft = lessonDrafts[lesson.id] ?? {
                    title: lesson.title,
                    content: lesson.content,
                    videoUrl: lesson.videoUrl ?? "",
                  };
                  const expanded = expandedLessonId === lesson.id;
                  return (
                    <li key={lesson.id} className="space-y-2 rounded-md bg-muted/30 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <button
                          type="button"
                          className="text-left text-sm font-medium hover:underline"
                          onClick={() =>
                            setExpandedLessonId(expanded ? null : lesson.id)
                          }
                        >
                          {lessonIndex + 1}. {lesson.title}
                          {lesson.fileName ? (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              · {lesson.fileName}
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
                            aria-label="Move lesson up"
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
                            aria-label="Move lesson down"
                          >
                            <ChevronDown className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            disabled={isPending}
                            onClick={() => {
                              if (!window.confirm("Delete this lesson?")) return;
                              run(
                                () => deleteLesson({ lessonId: lesson.id }),
                                "Lesson deleted.",
                              );
                            }}
                            aria-label="Delete lesson"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>

                      {expanded ? (
                        <div className="space-y-3 pt-1">
                          <Input
                            value={draft.title}
                            onChange={(event) =>
                              setLessonDrafts((current) => ({
                                ...current,
                                [lesson.id]: { ...draft, title: event.target.value },
                              }))
                            }
                            aria-label="Lesson title"
                          />
                          <Textarea
                            value={draft.content}
                            onChange={(event) =>
                              setLessonDrafts((current) => ({
                                ...current,
                                [lesson.id]: { ...draft, content: event.target.value },
                              }))
                            }
                            placeholder="Lesson content"
                            aria-label="Lesson content"
                          />
                          <Input
                            value={draft.videoUrl}
                            onChange={(event) =>
                              setLessonDrafts((current) => ({
                                ...current,
                                [lesson.id]: { ...draft, videoUrl: event.target.value },
                              }))
                            }
                            placeholder="Optional video URL"
                            aria-label="Lesson video URL"
                          />
                          <div className="flex flex-wrap gap-2">
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
                                      videoUrl: draft.videoUrl.trim() || null,
                                    }),
                                  "Lesson saved.",
                                )
                              }
                            >
                              Save lesson
                            </Button>
                            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-50">
                              <FileUp className="size-3.5" aria-hidden />
                              Upload file
                              <input
                                type="file"
                                className="sr-only"
                                disabled={isPending}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  if (!file) return;
                                  startTransition(async () => {
                                    const formData = new FormData();
                                    formData.set("lessonId", lesson.id);
                                    formData.set("file", file);
                                    const result = await uploadLessonFile(formData);
                                    if (!result.success) {
                                      toast.error(result.error);
                                      return;
                                    }
                                    toast.success("File uploaded.");
                                    refresh();
                                  });
                                  event.target.value = "";
                                }}
                              />
                            </label>
                          </div>
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
                  placeholder="New lesson title"
                  aria-label={`New lesson for module ${moduleIndex + 1}`}
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
                    }, "Lesson added.");
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  Add lesson
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
