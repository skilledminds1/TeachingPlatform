"use client";

import { useState, useTransition } from "react";
import { Download, PlayCircle } from "lucide-react";
import { toast } from "sonner";

import { getCourseAssetSignedUrl, getLessonFileSignedUrl } from "@/actions/courses";
import { Button } from "@/components/ui/button";
import { CoursePrivateVideoPlayer } from "./course-private-video-player";
import { isAllowedVideoEmbedUrl } from "@/lib/security/urls";

type CurriculumModule = {
  id: string;
  title: string;
  lessons: Array<{
    id: string;
    title: string;
    isPreview: boolean;
    content: string;
    videoUrl: string | null;
    fileName: string | null;
    assets: Array<{
      id: string;
      kind: "video" | "resource";
      fileName: string;
      mimeType: string;
      sizeBytes: number;
    }>;
  }>;
};

export function CurriculumPreview({ modules }: { modules: CurriculumModule[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const lessonCount = modules.reduce((sum, module) => sum + module.lessons.length, 0);
  const selected = modules.flatMap((module) => module.lessons).find((lesson) => lesson.id === selectedId);

  if (modules.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Curriculum details will appear here once the teacher adds modules and lessons.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {modules.length} module{modules.length === 1 ? "" : "s"} · {lessonCount} lesson
        {lessonCount === 1 ? "" : "s"}
      </p>
      <ol className="space-y-3">
        {modules.map((module, index) => (
          <li
            key={module.id}
            className="rounded-lg border border-border bg-background/50 px-4 py-3"
          >
            <p className="font-medium">
              <span className="text-muted-foreground">{index + 1}.</span> {module.title}
            </p>
            {module.lessons.length > 0 ? (
              <ul className="mt-2 space-y-1.5 border-l border-border pl-4">
                {module.lessons.map((lesson) => (
                  <li key={lesson.id} className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                    <span>{lesson.title}</span>
                    {lesson.isPreview ? (
                      <Button size="sm" variant="ghost" onClick={() => setSelectedId(lesson.id)}>
                        <PlayCircle className="size-4" /> Preview
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No lessons yet</p>
            )}
          </li>
        ))}
      </ol>
      {selected?.isPreview ? (
        <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-primary uppercase">Free preview</p>
              <h3 className="font-medium">{selected.title}</h3>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setSelectedId(null)}>Close</Button>
          </div>
          {selected.assets.find((asset) => asset.kind === "video") ? (
            <CoursePrivateVideoPlayer
              assetId={selected.assets.find((asset) => asset.kind === "video")!.id}
              title={selected.title}
            />
          ) : selected.videoUrl && isAllowedVideoEmbedUrl(selected.videoUrl) ? (
            <div className="aspect-video overflow-hidden rounded-lg">
              <iframe src={selected.videoUrl} title={selected.title} className="size-full" allowFullScreen />
            </div>
          ) : null}
          {selected.content ? <p className="whitespace-pre-wrap text-sm">{selected.content}</p> : null}
          <div className="flex flex-wrap gap-2">
            {selected.assets.filter((asset) => asset.kind === "resource").map((asset) => (
              <Button
                key={asset.id}
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => startTransition(async () => {
                  const result = await getCourseAssetSignedUrl({ assetId: asset.id });
                  if (!result.success) {
                    toast.error(result.error);
                    return;
                  }
                  window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
                })}
              >
                <Download className="size-4" /> {asset.fileName}
              </Button>
            ))}
            {selected.fileName && !selected.assets.some((asset) => asset.kind === "resource") ? (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => startTransition(async () => {
                  const result = await getLessonFileSignedUrl({ lessonId: selected.id });
                  if (!result.success) {
                    toast.error(result.error);
                    return;
                  }
                  window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
                })}
              >
                <Download className="size-4" /> {selected.fileName}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
