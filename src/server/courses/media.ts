import type { CourseLessonAssetKind } from "@prisma/client";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  COURSE_MEDIA_BUCKET,
  COURSE_RESOURCE_MAX_BYTES,
  COURSE_VIDEO_MAX_BYTES,
  courseResourceMimeTypes,
  courseVideoMimeTypes,
} from "@/lib/validations/courses";

const allowedResourceTypes = new Set<string>(courseResourceMimeTypes);
const allowedVideoTypes = new Set<string>(courseVideoMimeTypes);

export function validateCourseMediaMetadata(input: {
  kind: CourseLessonAssetKind;
  contentType: string;
  size: number;
}): string | null {
  const allowed = input.kind === "video" ? allowedVideoTypes : allowedResourceTypes;
  const maxBytes =
    input.kind === "video" ? COURSE_VIDEO_MAX_BYTES : COURSE_RESOURCE_MAX_BYTES;
  if (!allowed.has(input.contentType)) {
    return input.kind === "video"
      ? "Use an MP4 or WebM video."
      : "This resource file type is not supported.";
  }
  if (!Number.isInteger(input.size) || input.size <= 0 || input.size > maxBytes) {
    return input.kind === "video"
      ? "Video must be smaller than 500 MB."
      : "Resource must be smaller than 80 MB.";
  }
  return null;
}

function hasImageSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    );
  }
  if (mimeType === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}

export function hasValidCourseMediaSignature(
  bytes: Uint8Array,
  mimeType: string,
): boolean {
  if (mimeType === "video/webm") {
    return (
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3
    );
  }
  if (mimeType === "video/mp4") {
    return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  }
  if (mimeType === "application/pdf") {
    return String.fromCharCode(...bytes.slice(0, 4)) === "%PDF";
  }
  if (mimeType.startsWith("image/")) return hasImageSignature(bytes, mimeType);

  // Office, ZIP, and plain-text resources are accepted based on the storage
  // metadata. Their containers do not have a unique signature for each MIME.
  return true;
}

export function courseMediaPathPrefix(
  userId: string,
  courseId: string,
  lessonId: string,
): string {
  return `${userId}/${courseId}/${lessonId}/`;
}

export function courseMediaPathOwnedBy(
  path: string,
  userId: string,
  courseId: string,
  lessonId?: string,
): boolean {
  if (!path || path.includes("..") || path.startsWith("/") || path.includes("\\")) return false;
  const prefix = lessonId
    ? courseMediaPathPrefix(userId, courseId, lessonId)
    : `${userId}/${courseId}/`;
  return path.startsWith(prefix) && path.length > prefix.length;
}

export function createCourseMediaPath(input: {
  userId: string;
  courseId: string;
  lessonId: string;
  kind: CourseLessonAssetKind;
  fileName: string;
}): string {
  const safeName =
    input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-120) ||
    "asset";
  return `${courseMediaPathPrefix(input.userId, input.courseId, input.lessonId)}${input.kind}-${Date.now()}-${crypto.randomUUID()}-${safeName}`;
}

export async function ensureCourseMediaBucket() {
  const supabase = createAdminClient();
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;

  const existing = buckets?.find((bucket) => bucket.name === COURSE_MEDIA_BUCKET);
  const options = {
    public: false,
    fileSizeLimit: COURSE_VIDEO_MAX_BYTES,
    allowedMimeTypes: [...courseVideoMimeTypes, ...courseResourceMimeTypes],
  };
  if (!existing) {
    const { error } = await supabase.storage.createBucket(COURSE_MEDIA_BUCKET, options);
    if (error && !error.message.toLowerCase().includes("already exists")) throw error;
  } else {
    const { error } = await supabase.storage.updateBucket(COURSE_MEDIA_BUCKET, options);
    if (error) throw error;
  }
  return supabase;
}
