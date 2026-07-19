"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSubjectSpecialties } from "@/lib/subject-specialties";
import {
  avatarFileSchema,
  credentialFileSchema,
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
    select: { id: true, status: true, slug: true },
  });

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

  revalidatePath("/dashboard/teacher");
  revalidatePath("/dashboard/teacher/profile");
  revalidatePath("/onboarding/teacher");
  if (existing?.slug) {
    revalidatePath(`/teachers/${existing.slug}`);
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
