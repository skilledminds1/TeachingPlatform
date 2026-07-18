"use client";

import { Camera, CheckCircle2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { uploadTeacherAvatar } from "@/actions/teacher-onboarding";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";

import { prepareAvatarFile } from "../lib/prepare-avatar";

export function AvatarUploader({
  avatarUrl,
  name,
  onUploaded,
}: {
  avatarUrl: string;
  name: string;
  onUploaded: (url: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const initials =
    name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "T";

  function handleFile(file: File | undefined): void {
    if (!file) return;

    startTransition(async () => {
      try {
        const prepared = await prepareAvatarFile(file);
        const formData = new FormData();
        formData.set("avatar", prepared);

        const result = await uploadTeacherAvatar(formData);
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        onUploaded(result.data.avatarUrl);
        toast.success("Profile photo uploaded.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not upload that photo.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative w-fit">
        <Avatar className="size-24" aria-label={`${name || "Teacher"} profile photo`}>
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback className="text-xl">{initials}</AvatarFallback>
        </Avatar>
        <span className="absolute right-0 bottom-0 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-background">
          {avatarUrl ? (
            <CheckCircle2 className="size-4" aria-hidden />
          ) : (
            <Camera className="size-4" aria-hidden />
          )}
        </span>
      </div>
      <div className="max-w-sm space-y-2">
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={isPending}
          aria-label="Upload profile photo"
          onChange={(event) => {
            handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <p className="text-xs text-muted-foreground">
          {isPending
            ? "Uploading…"
            : "Use a clear head-and-shoulders photo. JPG, PNG or WebP (large photos are compressed automatically)."}
        </p>
      </div>
    </div>
  );
}
