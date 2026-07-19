"use client";

import { Loader2, Trash2, Upload, Video } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  confirmCourseMediaUpload,
  createCourseMediaUpload,
  getCourseAssetSignedUrl,
  removeCourseLessonAsset,
} from "@/actions/courses";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  COURSE_MEDIA_BUCKET,
  COURSE_RESOURCE_MAX_BYTES,
  COURSE_VIDEO_MAX_BYTES,
  courseResourceMimeTypes,
  courseVideoMimeTypes,
} from "@/lib/validations/courses";

type Asset = {
  id: string;
  kind: "video" | "resource";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export function LessonMediaUploader({
  lessonId,
  video,
  resources,
  onChanged,
}: {
  lessonId: string;
  video: Asset | null;
  resources: Asset[];
  onChanged: () => void;
}) {
  const videoInputRef = useRef<HTMLInputElement>(null);
  const resourceInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "uploading" | "confirming">("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const busy = state !== "idle" || isPending;

  async function upload(kind: "video" | "resource", file: File): Promise<void> {
    const max = kind === "video" ? COURSE_VIDEO_MAX_BYTES : COURSE_RESOURCE_MAX_BYTES;
    const allowed =
      kind === "video"
        ? (courseVideoMimeTypes as readonly string[])
        : (courseResourceMimeTypes as readonly string[]);
    if (!allowed.includes(file.type)) {
      toast.error(
        kind === "video"
          ? "Use an MP4 or WebM video."
          : "Unsupported file type. Use PDF, Office docs, images, text, or ZIP.",
      );
      return;
    }
    if (file.size > max) {
      toast.error(
        kind === "video"
          ? "Video must be smaller than 500 MB."
          : "File must be smaller than 80 MB.",
      );
      return;
    }

    setState("uploading");
    try {
      const prepared = await createCourseMediaUpload({
        lessonId,
        kind,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
      });
      if (!prepared.success) {
        toast.error(prepared.error);
        setState("idle");
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.storage
        .from(COURSE_MEDIA_BUCKET)
        .uploadToSignedUrl(prepared.data.path, prepared.data.token, file, {
          contentType: prepared.data.contentType,
        });
      if (error) {
        toast.error(error.message || "Upload failed.");
        setState("idle");
        return;
      }

      setState("confirming");
      const confirmed = await confirmCourseMediaUpload({
        lessonId,
        kind,
        path: prepared.data.path,
        contentType: prepared.data.contentType,
        fileName: file.name,
        size: file.size,
      });
      if (!confirmed.success) {
        toast.error(confirmed.error);
        setState("idle");
        return;
      }

      toast.success(kind === "video" ? "Lesson video uploaded." : "Resource uploaded.");
      setPreviewUrl(null);
      setState("idle");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
      setState("idle");
    }
  }

  function loadPreview(): void {
    if (!video) return;
    startTransition(async () => {
      const result = await getCourseAssetSignedUrl({ assetId: video.id });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setPreviewUrl(result.data.signedUrl);
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">Lesson video</p>
        <input
          ref={videoInputRef}
          type="file"
          accept={courseVideoMimeTypes.join(",")}
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload("video", file);
            event.target.value = "";
          }}
        />
        {video ? (
          <div className="space-y-3 rounded-xl border border-border bg-background p-3">
            {previewUrl ? (
              <video
                key={previewUrl}
                src={previewUrl}
                controls
                playsInline
                className="aspect-video w-full rounded-lg bg-black"
              />
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={loadPreview}
                className="flex aspect-video w-full flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 text-sm text-muted-foreground hover:bg-muted"
              >
                <Video className="mb-2 size-5" aria-hidden />
                {video.fileName}
                <span className="mt-1 text-xs">Click to preview</span>
              </button>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => videoInputRef.current?.click()}
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                Replace video
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  startTransition(async () => {
                    const result = await removeCourseLessonAsset({ assetId: video.id });
                    if (!result.success) {
                      toast.error(result.error);
                      return;
                    }
                    toast.success("Video removed.");
                    setPreviewUrl(null);
                    onChanged();
                  });
                }}
              >
                <Trash2 className="size-3.5" />
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => videoInputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center rounded-xl border border-dashed border-border px-4 py-8 text-center hover:border-primary/40 hover:bg-muted/30"
          >
            {busy ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              <Video className="size-5 text-muted-foreground" />
            )}
            <span className="mt-2 text-sm font-medium">
              {state === "idle" ? "Upload lesson video" : "Uploading…"}
            </span>
            <span className="mt-1 text-xs text-muted-foreground">
              MP4 or WebM, up to 500 MB. Private to enrolled students.
            </span>
          </button>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Downloadable resources</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => resourceInputRef.current?.click()}
          >
            <Upload className="size-3.5" />
            Add file
          </Button>
        </div>
        <input
          ref={resourceInputRef}
          type="file"
          accept={courseResourceMimeTypes.join(",")}
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload("resource", file);
            event.target.value = "";
          }}
        />
        {resources.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Optional PDFs, slides, worksheets, or other files (max 80 MB each).
          </p>
        ) : (
          <ul className="space-y-2">
            {resources.map((asset) => (
              <li
                key={asset.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className="truncate">{asset.fileName}</span>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={busy}
                  aria-label={`Remove ${asset.fileName}`}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await removeCourseLessonAsset({ assetId: asset.id });
                      if (!result.success) {
                        toast.error(result.error);
                        return;
                      }
                      toast.success("Resource removed.");
                      onChanged();
                    });
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
