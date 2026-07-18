"use client";

import { FileUp, ExternalLink } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { uploadTeacherCredential } from "@/actions/teacher-onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CredentialUploader({
  credentialUrl,
  onUploaded,
  onCleared,
}: {
  credentialUrl: string;
  onUploaded: (url: string) => void;
  onCleared: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleFile(file: File | undefined): void {
    if (!file) return;

    const formData = new FormData();
    formData.set("credential", file);

    startTransition(async () => {
      const result = await uploadTeacherCredential(formData);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onUploaded(result.data.credentialUrl);
      toast.success("Credential uploaded.");
    });
  }

  return (
    <div className="space-y-2">
      {credentialUrl ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            render={<a href={credentialUrl} target="_blank" rel="noreferrer" />}
          >
            <ExternalLink className="size-3.5" aria-hidden />
            View file
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCleared} disabled={isPending}>
            Remove
          </Button>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <Input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          disabled={isPending}
          aria-label="Upload qualification credential"
          onChange={(event) => {
            handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <FileUp className="size-3.5 shrink-0" aria-hidden />
        {isPending
          ? "Uploading…"
          : "Optional. Upload a PDF or image of the certificate (max 3 MB)."}
      </p>
    </div>
  );
}
