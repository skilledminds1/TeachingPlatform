"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { hasValidImageSignature } from "@/lib/security/image-signature";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isValidIanaTimeZone } from "@/lib/timezone-validation";
import { avatarFileSchema } from "@/lib/validations/teacher-onboarding";
import { toCountryCode } from "@/lib/countries";
import { requireAuth } from "@/server/auth/session";
import { enforceActionRateLimit } from "@/server/security/action-rate-limit";
import { fail, ok, type ActionResult } from "@/types/action";

const studentSettingsSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name.").max(100),
  timezone: z.string().refine(isValidIanaTimeZone, {
    message: "Choose a valid timezone.",
  }),
  // INT-13: the backfill route for accounts created before country existed. Optional here
  // because this form is also used by people who already have one set.
  country: z.string().trim().optional(),
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
      // Only ever set to a recognised code; a blank or bad value leaves the column alone
      // rather than wiping a country the user already has.
      ...(toCountryCode(parsed.data.country)
        ? { country: toCountryCode(parsed.data.country)! }
        : {}),
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  return ok({ updated: true });
}

export async function uploadStudentAvatar(
  formData: FormData,
): Promise<ActionResult<{ avatarUrl: string }>> {
  const user = await requireAuth();
  const limited = await enforceActionRateLimit({
    action: "upload",
    limit: 15,
    windowMs: 60 * 60_000,
    userId: user.id,
  });
  if (limited) return limited;
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
