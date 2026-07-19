"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { TIMEZONE_OPTIONS } from "@/lib/timezone";
import { avatarFileSchema } from "@/lib/validations/teacher-onboarding";
import { requireAuth } from "@/server/auth/session";
import { fail, ok, type ActionResult } from "@/types/action";

const timezoneValues = new Set<string>(
  TIMEZONE_OPTIONS.map((option) => option.value),
);

const studentSettingsSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(100),
  timezone: z.string().refine((value) => timezoneValues.has(value), {
    message: "Choose a valid timezone.",
  }),
});

export async function updateStudentSettings(
  input: unknown,
): Promise<ActionResult<{ updated: true }>> {
  const parsed = studentSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      parsed.error.issues[0]?.message ?? "Invalid account settings.",
      "VALIDATION_ERROR",
    );
  }

  const user = await requireAuth();
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    data: { name: parsed.data.name },
  });
  if (error) {
    return fail(error.message, "VALIDATION_ERROR");
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      name: parsed.data.name,
      timezone: parsed.data.timezone,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return ok({ updated: true });
}

function hasValidImageSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }
  if (mimeType === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}

export async function uploadStudentAvatar(
  formData: FormData,
): Promise<ActionResult<{ avatarUrl: string }>> {
  const user = await requireAuth();
  const parsed = avatarFileSchema.safeParse(formData.get("avatar"));
  if (!parsed.success) {
    return fail(
      parsed.error.issues[0]?.message ?? "Invalid image.",
      "VALIDATION_ERROR",
    );
  }

  const extensionByType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const extension = extensionByType[parsed.data.type];
  if (!extension) {
    return fail("Unsupported image format.", "VALIDATION_ERROR");
  }

  const bytes = new Uint8Array(await parsed.data.arrayBuffer());
  if (!hasValidImageSignature(bytes, parsed.data.type)) {
    return fail("The uploaded file is not a valid image.", "VALIDATION_ERROR");
  }

  const fileName = `profile-${Date.now()}.${extension}`;
  const storagePath = `${user.id}/${fileName}`;
  const storage = createAdminClient().storage;
  const { error } = await storage.from("avatars").upload(storagePath, bytes, {
    contentType: parsed.data.type,
    cacheControl: "3600",
    upsert: true,
  });
  if (error) {
    return fail("Profile photo upload failed. Please try again.");
  }

  const {
    data: { publicUrl },
  } = storage.from("avatars").getPublicUrl(storagePath);

  const supabase = await createClient();
  const { error: metadataError } = await supabase.auth.updateUser({
    data: { avatar_url: publicUrl },
  });
  if (metadataError) {
    await storage.from("avatars").remove([storagePath]);
    return fail(metadataError.message, "VALIDATION_ERROR");
  }

  await db.user.update({
    where: { id: user.id },
    data: { avatarUrl: publicUrl },
  });

  const { data: existingFiles } = await storage.from("avatars").list(user.id);
  const stalePaths =
    existingFiles
      ?.filter((file) => file.name !== fileName)
      .map((file) => `${user.id}/${file.name}`) ?? [];
  if (stalePaths.length > 0) {
    await storage.from("avatars").remove(stalePaths);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/messages");
  return ok({ avatarUrl: publicUrl });
}
