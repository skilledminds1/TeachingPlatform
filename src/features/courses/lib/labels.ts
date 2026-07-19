import type { CourseLevel, CourseStatus } from "@prisma/client";

export function formatCourseLevel(level: CourseLevel): string {
  if (level === "all_levels") return "All levels";
  return level.replaceAll("_", " ");
}

export function courseStatusTone(
  status: CourseStatus,
): "success" | "warning" | "neutral" | "danger" | "info" {
  if (status === "published") return "success";
  if (status === "draft") return "warning";
  if (status === "archived") return "neutral";
  return "neutral";
}
