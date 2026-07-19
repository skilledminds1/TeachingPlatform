"use client";

import { Loader2, Trash2, Upload, Video } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  confirmTeacherIntroVideoUpload,
  createTeacherIntroVideoUpload,
  removeTeacherIntroVideo,
} from "@/actions/teacher-onboarding";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  INTRO_VIDEO_BUCKET,
  INTRO_VIDEO_MAX_BYTES,
  INTRO_VIDEO_MAX_SECONDS,
  INTRO_VIDEO_MIN_SECONDS,
  introVideoFileSchema,
  introVideoMimeTypes,
} from "@/lib/validations/teacher-onboarding";

type UploadState = "idle" | "checking" | "uploading" | "confirming";

function readVideoMetadata(file: File): Promise<{
  duration: number;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
    };

    video.onloadedmetadata = () => {
      const duration = video.duration;
      const width = video.videoWidth;
      const height = video.videoHeight;
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0 || width <= 0 || height <= 0) {
        reject(new Error("Could not read that video. Try another file."));
        return;
      }
      resolve({ duration, width, height });
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Could not read that video. Try another MP4 or WebM file."));
    };

    video.src = objectUrl;
  });
}

export function IntroVideoUploader({
  introVideoUrl,
  introVideoPath = "",
  onUploaded,
  onRemoved,
}: {
  introVideoUrl: string;
  introVideoPath?: string;
  onUploaded: (value: { introVideoUrl: string; introVideoPath: string }) => void;
  onRemoved: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [isRemoving, startRemove] = useTransition();
  const busy = state !== "idle" || isRemoving;

  async function handleFile(file: File | undefined): Promise<void> {
    if (!file || busy) return;

    const parsed = introVideoFileSchema.safeParse(file);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Choose a valid video.");
      return;
    }

    setState("checking");
    try {
      const metadata = await readVideoMetadata(file);
      if (
        metadata.duration < INTRO_VIDEO_MIN_SECONDS ||
        metadata.duration > INTRO_VIDEO_MAX_SECONDS
      ) {
        toast.error("Video must be between 30 seconds and 2 minutes long.");
        setState("idle");
        return;
      }
      if (metadata.width <= metadata.height) {
        toast.error("Record in landscape (horizontal) orientation.");
        setState("idle");
        return;
      }

      setState("uploading");
      const prepared = await createTeacherIntroVideoUpload({
        fileName: file.name,
        contentType: file.type as (typeof introVideoMimeTypes)[number],
        size: file.size,
      });
      if (!prepared.success) {
        toast.error(prepared.error);
        setState("idle");
        return;
      }

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from(INTRO_VIDEO_BUCKET)
        .uploadToSignedUrl(prepared.data.path, prepared.data.token, file, {
          contentType: prepared.data.contentType,
        });
      if (uploadError) {
        toast.error(uploadError.message || "Upload failed. Please try again.");
        setState("idle");
        return;
      }

      setState("confirming");
      const confirmed = await confirmTeacherIntroVideoUpload({
        path: prepared.data.path,
        contentType: prepared.data.contentType,
      });
      if (!confirmed.success) {
        toast.error(confirmed.error);
        setState("idle");
        return;
      }

      onUploaded(confirmed.data);
      toast.success("Introduction video uploaded.");
      setState("idle");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not upload that video.",
      );
      setState("idle");
    }
  }

  function handleRemove(): void {
    if (busy) return;
    startRemove(async () => {
      const result = await removeTeacherIntroVideo(
        introVideoPath ? { path: introVideoPath } : undefined,
      );
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onRemoved();
      toast.success("Introduction video removed.");
    });
  }

  const statusLabel =
    state === "checking"
      ? "Checking video…"
      : state === "uploading"
        ? "Uploading…"
        : state === "confirming"
          ? "Saving…"
          : isRemoving
            ? "Removing…"
            : null;

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept={introVideoMimeTypes.join(",")}
        disabled={busy}
        className="sr-only"
        aria-label={introVideoUrl ? "Replace introduction video" : "Upload introduction video"}
        onChange={(event) => {
          void handleFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {introVideoUrl ? (
        <>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <video
              key={introVideoUrl}
              src={introVideoUrl}
              controls
              playsInline
              preload="metadata"
              className="aspect-video w-full bg-black"
            >
              Your browser does not support embedded video.
            </video>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Upload className="size-4" aria-hidden />
              )}
              {statusLabel ?? "Replace video"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={handleRemove}
            >
              <Trash2 className="size-4" aria-hidden />
              Remove
            </Button>
          </div>
        </>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-default disabled:hover:border-border disabled:hover:bg-card"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {busy ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <Video className="size-5" aria-hidden />
            )}
          </span>
          <span className="mt-4 text-sm font-semibold">
            {statusLabel ?? "Upload your introduction video"}
          </span>
          <span className="mt-1 max-w-sm text-sm text-muted-foreground">
            Click to choose a file. MP4 or WebM, landscape, 30 seconds to 2 minutes,
            up to {Math.round(INTRO_VIDEO_MAX_BYTES / (1024 * 1024))} MB.
          </span>
        </button>
      )}
    </div>
  );
}
