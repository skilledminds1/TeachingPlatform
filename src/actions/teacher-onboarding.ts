"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSubjectSpecialties } from "@/lib/subject-specialties";
import {
  avatarFileSchema,
  credentialFileSchema,
  INTRO_VIDEO_BUCKET,
  INTRO_VIDEO_MAX_BYTES,
  introVideoConfirmSchema,
  introVideoUploadRequestSchema,
  teacherOnboardingSchema,
} from "@/lib/validations/teacher-onboarding";
import { requireTeacher } from "@/server/auth/session";
import { getTeacherProfileReadiness } from "@/server/teachers/onboarding";
import { fail, ok, type ActionResult } from "@/types/action";
import { slugify } from "@/utils/slugify";

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

function hasValidCredentialSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "application/pdf") {
    return String.fromCharCode(...bytes.slice(0, 4)) === "%PDF";
  }
  return hasValidImageSignature(bytes, mimeType);
}

function hasValidVideoSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "video/webm") {
    return (
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3
    );
  }
  if (mimeType === "video/mp4") {
    // ISO BMFF: bytes 4-7 are typically "ftyp"
    const box = String.fromCharCode(...bytes.slice(4, 8));
    return box === "ftyp";
  }
  return false;
}

function introVideoOwnedByUser(path: string, userId: string): boolean {
  return path.startsWith(`${userId}/`) && !path.includes("..");
}

async function ensureIntroVideoBucket() {
  const supabase = createAdminClient();
  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((bucket) => bucket.name === INTRO_VIDEO_BUCKET);
  if (exists) return supabase;

  const { error } = await supabase.storage.createBucket(INTRO_VIDEO_BUCKET, {
    public: true,
    fileSizeLimit: INTRO_VIDEO_MAX_BYTES,
    allowedMimeTypes: ["video/mp4", "video/webm"],
  });
  if (error && !error.message.toLowerCase().includes("already exists")) {
    throw error;
  }
  return supabase;
}

export async function uploadTeacherAvatar(
  formData: FormData,
): Promise<ActionResult<{ avatarUrl: string }>> {
  const user = await requireTeacher();
  const parsed = avatarFileSchema.safeParse(formData.get("avatar"));

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid image.", "VALIDATION_ERROR");
  }

  const extensionByType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const extension = extensionByType[parsed.data.type];
  if (!extension) return fail("Unsupported image format.", "VALIDATION_ERROR");

  const fileName = `profile-${Date.now()}.${extension}`;
  const storagePath = `${user.id}/${fileName}`;
  const arrayBuffer = await parsed.data.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  if (!hasValidImageSignature(bytes, parsed.data.type)) {
    return fail("The uploaded file is not a valid image.", "VALIDATION_ERROR");
  }

  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from("avatars")
    .upload(storagePath, bytes, {
      contentType: parsed.data.type,
      cacheControl: "3600",
      upsert: true,
    });

  if (error) {
    return fail("Profile photo upload failed. Please try again.");
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(storagePath);

  const { data: existingFiles } = await supabase.storage.from("avatars").list(user.id);
  const stalePaths =
    existingFiles
      ?.filter((file) => file.name !== fileName)
      .map((file) => `${user.id}/${file.name}`) ?? [];
  if (stalePaths.length > 0) {
    await supabase.storage.from("avatars").remove(stalePaths);
  }

  await db.user.update({
    where: { id: user.id },
    data: { avatarUrl: publicUrl },
  });

  revalidatePath("/onboarding/teacher");
  revalidatePath("/dashboard/teacher/profile");
  return ok({ avatarUrl: publicUrl });
}

export async function uploadTeacherCredential(
  formData: FormData,
): Promise<ActionResult<{ credentialUrl: string }>> {
  const user = await requireTeacher();
  const parsed = credentialFileSchema.safeParse(formData.get("credential"));

  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid file.", "VALIDATION_ERROR");
  }

  const extensionByType: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const extension = extensionByType[parsed.data.type];
  if (!extension) return fail("Unsupported file format.", "VALIDATION_ERROR");

  const fileName = `credential-${Date.now()}.${extension}`;
  const storagePath = `${user.id}/${fileName}`;
  const arrayBuffer = await parsed.data.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  if (!hasValidCredentialSignature(bytes, parsed.data.type)) {
    return fail("The uploaded file is not a valid PDF or image.", "VALIDATION_ERROR");
  }

  const supabase = createAdminClient();
  const { error } = await supabase.storage.from("credentials").upload(storagePath, bytes, {
    contentType: parsed.data.type,
    cacheControl: "3600",
    upsert: false,
  });

  if (error) {
    return fail(
      "Credential upload failed. Create a public `credentials` storage bucket in Supabase, then try again.",
    );
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("credentials").getPublicUrl(storagePath);

  revalidatePath("/onboarding/teacher");
  revalidatePath("/dashboard/teacher/profile");
  return ok({ credentialUrl: publicUrl });
}

export async function createTeacherIntroVideoUpload(
  input: unknown,
): Promise<ActionResult<{ path: string; token: string; contentType: string }>> {
  const parsed = introVideoUploadRequestSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid video.", "VALIDATION_ERROR");
  }

  const user = await requireTeacher();
  const extensionByType: Record<string, string> = {
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  const extension = extensionByType[parsed.data.contentType];
  if (!extension) return fail("Unsupported video format.", "VALIDATION_ERROR");

  try {
    const supabase = await ensureIntroVideoBucket();
    const path = `${user.id}/intro-${Date.now()}.${extension}`;
    const { data, error } = await supabase.storage
      .from(INTRO_VIDEO_BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) {
      return fail(
        error?.message ??
          "Could not prepare video upload. Create a public `teacher-intros` bucket in Supabase.",
      );
    }

    return ok({
      path: data.path,
      token: data.token,
      contentType: parsed.data.contentType,
    });
  } catch (error) {
    return fail(
      error instanceof Error
        ? error.message
        : "Could not prepare video upload. Check Supabase storage configuration.",
    );
  }
}

export async function confirmTeacherIntroVideoUpload(
  input: unknown,
): Promise<ActionResult<{ introVideoUrl: string; introVideoPath: string }>> {
  const parsed = introVideoConfirmSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid video upload.", "VALIDATION_ERROR");
  }

  const user = await requireTeacher();
  if (!introVideoOwnedByUser(parsed.data.path, user.id)) {
    return fail("Invalid video path.", "FORBIDDEN");
  }

  const supabase = await ensureIntroVideoBucket();
  const folder = user.id;
  const fileName = parsed.data.path.slice(user.id.length + 1);
  const { data: listed, error: listError } = await supabase.storage
    .from(INTRO_VIDEO_BUCKET)
    .list(folder, { search: fileName });

  if (listError) {
    return fail("Could not verify the uploaded video.", "INTERNAL_ERROR");
  }

  const object = listed?.find((item) => item.name === fileName);
  if (!object) {
    return fail("Uploaded video was not found. Please try again.", "NOT_FOUND");
  }

  const size =
    typeof object.metadata === "object" &&
    object.metadata &&
    "size" in object.metadata &&
    typeof object.metadata.size === "number"
      ? object.metadata.size
      : null;
  if (size !== null && size > INTRO_VIDEO_MAX_BYTES) {
    await supabase.storage.from(INTRO_VIDEO_BUCKET).remove([parsed.data.path]);
    return fail("Video must be smaller than 80 MB.", "VALIDATION_ERROR");
  }

  const { data: blob, error: downloadError } = await supabase.storage
    .from(INTRO_VIDEO_BUCKET)
    .download(parsed.data.path);
  if (downloadError || !blob) {
    return fail("Could not verify the uploaded video.", "INTERNAL_ERROR");
  }

  const header = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
  if (!hasValidVideoSignature(header, parsed.data.contentType)) {
    await supabase.storage.from(INTRO_VIDEO_BUCKET).remove([parsed.data.path]);
    return fail("The uploaded file is not a valid MP4 or WebM video.", "VALIDATION_ERROR");
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(INTRO_VIDEO_BUCKET).getPublicUrl(parsed.data.path);

  const existing = await db.teacherProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, introVideoPath: true, slug: true },
  });

  if (existing) {
    await db.teacherProfile.update({
      where: { id: existing.id },
      data: {
        introVideoUrl: publicUrl,
        introVideoPath: parsed.data.path,
      },
    });

    if (existing.introVideoPath && existing.introVideoPath !== parsed.data.path) {
      await supabase.storage.from(INTRO_VIDEO_BUCKET).remove([existing.introVideoPath]);
    }

    const { data: existingFiles } = await supabase.storage
      .from(INTRO_VIDEO_BUCKET)
      .list(user.id);
    const stalePaths =
      existingFiles
        ?.filter((file) => file.name !== fileName)
        .map((file) => `${user.id}/${file.name}`) ?? [];
    if (stalePaths.length > 0) {
      await supabase.storage.from(INTRO_VIDEO_BUCKET).remove(stalePaths);
    }

    revalidatePath("/dashboard/teacher");
    revalidatePath("/dashboard/teacher/profile");
    revalidatePath("/onboarding/teacher");
    if (existing.slug) revalidatePath(`/find-tutor/${existing.slug}`);
  }

  return ok({ introVideoUrl: publicUrl, introVideoPath: parsed.data.path });
}

export async function removeTeacherIntroVideo(
  input?: unknown,
): Promise<ActionResult<{ removed: true }>> {
  const user = await requireTeacher();
  const pathInput =
    typeof input === "object" &&
    input &&
    "path" in input &&
    typeof (input as { path: unknown }).path === "string"
      ? (input as { path: string }).path.trim()
      : "";

  const profile = await db.teacherProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, introVideoPath: true, slug: true },
  });

  const pathToRemove =
    (pathInput && introVideoOwnedByUser(pathInput, user.id) ? pathInput : null) ??
    (profile?.introVideoPath && introVideoOwnedByUser(profile.introVideoPath, user.id)
      ? profile.introVideoPath
      : null);

  if (pathToRemove) {
    const supabase = createAdminClient();
    await supabase.storage.from(INTRO_VIDEO_BUCKET).remove([pathToRemove]);
  }

  if (profile) {
    await db.teacherProfile.update({
      where: { id: profile.id },
      data: { introVideoUrl: null, introVideoPath: null },
    });
    revalidatePath("/dashboard/teacher");
    revalidatePath("/dashboard/teacher/profile");
    revalidatePath("/onboarding/teacher");
    if (profile.slug) revalidatePath(`/find-tutor/${profile.slug}`);
  }

  return ok({ removed: true });
}

export async function saveTeacherOnboarding(
  input: unknown,
): Promise<ActionResult<{ saved: true }>> {
  const parsed = teacherOnboardingSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid profile.", "VALIDATION_ERROR");
  }

  const user = await requireTeacher();
  if (!user.avatarUrl) {
    return fail("Upload a profile photo before continuing.", "VALIDATION_ERROR");
  }

  const membership = user.memberships.find(
    (item) => item.role === "admin" || item.role === "instructor",
  );
  if (!membership) return fail("Teacher organization not found.", "FORBIDDEN");

  const existing = await db.teacherProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, status: true, slug: true, introVideoPath: true, introVideoUrl: true },
  });

  const hasVideoInput =
    Boolean(parsed.data.introVideoUrl) && Boolean(parsed.data.introVideoPath);
  const requiresVideo = !existing || existing.status !== "approved";

  let introVideoUrl: string | null = existing?.introVideoUrl ?? null;
  let introVideoPath: string | null = existing?.introVideoPath ?? null;

  if (hasVideoInput) {
    if (!introVideoOwnedByUser(parsed.data.introVideoPath, user.id)) {
      return fail("Upload a valid introduction video before continuing.", "VALIDATION_ERROR");
    }

    const supabase = createAdminClient();
    const {
      data: { publicUrl },
    } = supabase.storage.from(INTRO_VIDEO_BUCKET).getPublicUrl(parsed.data.introVideoPath);
    if (parsed.data.introVideoUrl !== publicUrl) {
      return fail("Upload a valid introduction video before continuing.", "VALIDATION_ERROR");
    }

    introVideoUrl = publicUrl;
    introVideoPath = parsed.data.introVideoPath;
  } else if (requiresVideo) {
    return fail("Upload a valid introduction video before continuing.", "VALIDATION_ERROR");
  }

  const validSubjects = await db.subject.findMany({
    where: { id: { in: parsed.data.subjectIds } },
    select: { id: true, slug: true },
  });
  if (validSubjects.length !== parsed.data.subjectIds.length) {
    return fail("One or more selected subjects are invalid.", "VALIDATION_ERROR");
  }

  const subjectsById = new Map(validSubjects.map((subject) => [subject.id, subject]));
  for (const [subjectId, specialties] of Object.entries(parsed.data.subjectSpecialties)) {
    if (!parsed.data.subjectIds.includes(subjectId)) {
      return fail("Subject details must match selected subjects.", "VALIDATION_ERROR");
    }
    const subject = subjectsById.get(subjectId);
    if (!subject) {
      return fail("One or more selected subjects are invalid.", "VALIDATION_ERROR");
    }
    const allowed = new Set(getSubjectSpecialties(subject.slug));
    if (specialties.some((specialty) => !allowed.has(specialty))) {
      return fail(`Invalid details for ${subject.slug}.`, "VALIDATION_ERROR");
    }
  }

  const subjectRows = parsed.data.subjectIds.map((subjectId) => ({
    subjectId,
    specialties: parsed.data.subjectSpecialties[subjectId] ?? [],
  }));

  const profileData = {
    bio: parsed.data.bio,
    headline: parsed.data.headline,
    hourlyRateCents: Math.round(Number(parsed.data.hourlyRate) * 100),
    currency: parsed.data.currency,
    introVideoUrl,
    introVideoPath,
    status:
      existing?.status === "rejected"
        ? ("draft" as const)
        : (existing?.status ?? ("draft" as const)),
    rejectionReason: null,
  };

  await db.$transaction(async (transaction) => {
    await transaction.user.update({
      where: { id: user.id },
      data: {
        name: parsed.data.name,
        timezone: parsed.data.timezone,
      },
    });

    if (existing) {
      await transaction.teacherProfile.update({
        where: { id: existing.id },
        data: {
          ...profileData,
          subjects: {
            deleteMany: {},
            create: subjectRows,
          },
          qualifications: {
            deleteMany: {},
            create: parsed.data.qualifications.map((qualification) => ({
              title: qualification.title,
              institution: qualification.institution,
              issuedYear: Number(qualification.issuedYear),
              credentialUrl: qualification.credentialUrl || null,
              status: existing.status === "approved" ? "verified" : "pending",
            })),
          },
        },
      });
    } else {
      const baseSlug = slugify(parsed.data.name) || "teacher";
      await transaction.teacherProfile.create({
        data: {
          ...profileData,
          userId: user.id,
          organizationId: membership.organizationId,
          slug: `${baseSlug}-${user.id.slice(0, 8)}`,
          subjects: {
            create: subjectRows,
          },
          qualifications: {
            create: parsed.data.qualifications.map((qualification) => ({
              title: qualification.title,
              institution: qualification.institution,
              issuedYear: Number(qualification.issuedYear),
              credentialUrl: qualification.credentialUrl || null,
            })),
          },
        },
      });
    }
  });

  if (
    hasVideoInput &&
    existing?.introVideoPath &&
    introVideoPath &&
    existing.introVideoPath !== introVideoPath
  ) {
    const supabase = createAdminClient();
    await supabase.storage.from(INTRO_VIDEO_BUCKET).remove([existing.introVideoPath]);
  }

  revalidatePath("/dashboard/teacher");
  revalidatePath("/dashboard/teacher/profile");
  revalidatePath("/onboarding/teacher");
  if (existing?.slug) {
    revalidatePath(`/find-tutor/${existing.slug}`);
  }
  return ok({ saved: true });
}

export async function submitTeacherProfile(): Promise<
  ActionResult<{ submitted: true }>
> {
  const readiness = await getTeacherProfileReadiness();
  if (!readiness.profile) return fail("Complete your profile first.", "VALIDATION_ERROR");
  if (!readiness.readyToSubmit) {
    return fail(
      "Complete every marketplace requirement before submitting.",
      "VALIDATION_ERROR",
    );
  }

  await db.teacherProfile.update({
    where: { id: readiness.profile.id },
    data: {
      status: "pending_approval",
      submittedAt: new Date(),
      rejectionReason: null,
    },
  });

  revalidatePath("/dashboard/teacher");
  revalidatePath("/admin/teachers");
  return ok({ submitted: true });
}
