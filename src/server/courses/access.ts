import { db } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

export async function getTeacherCourseContext(userId: string) {
  const profile = await db.teacherProfile.findFirst({
    where: { userId, deletedAt: null },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      status: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          plan: {
            select: {
              id: true,
              name: true,
              slug: true,
              courseLimit: true,
              features: true,
            },
          },
        },
      },
    },
  });

  if (!profile) {
    throw new ForbiddenError("Complete your teacher profile before managing courses.");
  }

  return {
    profile,
    organization: profile.organization,
    plan: profile.organization.plan,
  };
}

export async function assertCourseOwnership(courseId: string, userId: string) {
  const course = await db.course.findFirst({
    where: { id: courseId, deletedAt: null },
    select: {
      id: true,
      teacherId: true,
      organizationId: true,
      slug: true,
      title: true,
      status: true,
      coverImageUrl: true,
    },
  });

  if (!course) throw new NotFoundError("Course not found.");
  if (course.teacherId !== userId) {
    throw new ForbiddenError("You do not have permission to manage this course.");
  }
  return course;
}

export async function getCourseUsage(organizationId: string) {
  const [organization, courseCount] = await Promise.all([
    db.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: {
        plan: {
          select: {
            id: true,
            name: true,
            slug: true,
            courseLimit: true,
          },
        },
      },
    }),
    db.course.count({ where: { organizationId, deletedAt: null } }),
  ]);

  const limit = organization.plan.courseLimit;
  return {
    courseCount,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - courseCount),
    atLimit: limit !== null && courseCount >= limit,
    plan: organization.plan,
  };
}

export async function canSubmitCourse(courseId: string, userId: string) {
  const course = await db.course.findFirst({
    where: { id: courseId, teacherId: userId, deletedAt: null },
    select: {
      id: true,
      title: true,
      description: true,
      coverImageUrl: true,
      priceCents: true,
      teacher: {
        select: {
          teacherProfile: { select: { status: true } },
          teacherPaymentAccounts: {
            where: { isActive: true, onboardingStatus: "complete" },
            select: { id: true },
            take: 1,
          },
        },
      },
      modules: {
        select: {
          lessons: {
            select: {
              id: true,
              content: true,
              videoUrl: true,
              fileStoragePath: true,
              assets: { select: { id: true }, take: 1 },
            },
          },
        },
      },
    },
  });

  if (!course) throw new NotFoundError("Course not found.");

  const reasons: string[] = [];
  if (course.teacher.teacherProfile?.status !== "approved") {
    reasons.push("Your teacher profile must be approved.");
  }
  if (course.priceCents > 0 && course.teacher.teacherPaymentAccounts.length === 0) {
    reasons.push("Link a payment account before submitting a paid course.");
  }
  const lessons = course.modules.flatMap((module) => module.lessons);
  if (lessons.length === 0) {
    reasons.push("Add at least one lesson.");
  } else if (
    !lessons.some(
      (lesson) =>
        Boolean(lesson.content.trim()) ||
        Boolean(lesson.videoUrl) ||
        Boolean(lesson.fileStoragePath) ||
        lesson.assets.length > 0,
    )
  ) {
    reasons.push("Add content, a video, or a resource to at least one lesson.");
  }
  if (!course.title.trim()) reasons.push("Add a course title.");
  if (!course.description.trim()) reasons.push("Add a course description.");
  if (!course.coverImageUrl) reasons.push("Add a course cover image.");
  if (!Number.isInteger(course.priceCents) || course.priceCents < 0) {
    reasons.push("Set a valid course price.");
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}

/** @deprecated Use canSubmitCourse for the moderation workflow. */
export const canPublishCourse = canSubmitCourse;
