"use client";

import { Download, Video } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { getCourseAssetSignedUrl } from "@/actions/courses";
import { Button } from "@/components/ui/button";

type Asset = {
  id: string;
  kind: "video" | "resource";
  fileName: string;
  mimeType: string;
};

export function AdminCourseMediaPreview({ assets }: { assets: Asset[] }) {
  const [isPending, startTransition] = useTransition();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const video = assets.find((asset) => asset.kind === "video") ?? null;
  const resources = assets.filter((asset) => asset.kind === "resource");

  if (!video && resources.length === 0) {
    return <p className="mt-2 text-xs text-muted-foreground">No media attached.</p>;
  }

  return (
    <div className="mt-3 space-y-3">
      {video ? (
        <div className="space-y-2">
          {videoUrl ? (
            <video
              key={videoUrl}
              src={videoUrl}
              controls
              playsInline
              className="aspect-video w-full max-w-xl rounded-lg bg-black"
            />
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  const result = await getCourseAssetSignedUrl({ assetId: video.id });
                  if (!result.success) {
                    toast.error(result.error);
                    return;
                  }
                  setVideoUrl(result.data.signedUrl);
                });
              }}
            >
              <Video className="size-3.5" aria-hidden />
              Preview video ({video.fileName})
            </Button>
          )}
        </div>
      ) : null}

      {resources.length > 0 ? (
        <ul className="space-y-2">
          {resources.map((asset) => (
            <li key={asset.id}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await getCourseAssetSignedUrl({ assetId: asset.id });
                    if (!result.success) {
                      toast.error(result.error);
                      return;
                    }
                    window.open(result.data.signedUrl, "_blank", "noopener,noreferrer");
                  });
                }}
              >
                <Download className="size-3.5" aria-hidden />
                {asset.fileName}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
