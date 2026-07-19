"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { getCourseAssetSignedUrl } from "@/actions/courses";

export function CoursePrivateVideoPlayer({
  assetId,
  title,
}: {
  assetId: string;
  title: string;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getCourseAssetSignedUrl({ assetId });
      if (cancelled) return;
      if (!result.success) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setSignedUrl(result.data.signedUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  if (error) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl border border-border bg-muted text-sm text-muted-foreground">
        Could not load video.
      </div>
    );
  }

  if (!signedUrl) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl border border-border bg-black text-sm text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-hidden />
        <span className="sr-only">Loading video for {title}</span>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-black">
      <video
        key={signedUrl}
        src={signedUrl}
        controls
        playsInline
        className="aspect-video w-full"
      >
        Your browser does not support embedded video.
      </video>
    </div>
  );
}
