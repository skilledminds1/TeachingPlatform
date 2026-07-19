"use client";

import { Camera, CheckCircle2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { uploadStudentAvatar } from "@/actions/student-settings";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { prepareAvatarFile } from "@/features/teacher-onboarding/lib/prepare-avatar";

export function StudentAvatarUploader({
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
      .toUpperCase() || "S";

  function handleFile(file: File | undefined): void {
    if (!file) return;

    startTransition(async () => {
      try {
        const prepared = await prepareAvatarFile(file);
        const formData = new FormData();
        formData.set("avatar", prepared);

        const result = await uploadStudentAvatar(formData);
        if (!result.success) {
          toast.error(result.error);
          return;
        }
        onUploaded(result.data.avatarUrl);
        toast.success("Profile photo updated.");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not upload that photo.",
        );
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-muted/20 p-4 sm:flex-row sm:items-center">
      <div className="relative w-fit shrink-0">
        <Avatar className="size-24" aria-label={`${name || "Student"} profile photo`}>
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

      <div className="max-w-md space-y-2">
        <p className="text-sm font-medium">Profile picture</p>
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={isPending}
          aria-label="Upload profile picture"
          onChange={(event) => {
            handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <p className="text-xs text-muted-foreground">
          {isPending
            ? "Uploading…"
            : "Upload a JPG, PNG, or WebP photo. Large images are compressed automatically."}
        </p>
      </div>
    </div>
  );
}
