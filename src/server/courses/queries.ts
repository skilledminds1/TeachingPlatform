import type { CourseLevel, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

export type CourseSort = "newest" | "price_asc" | "price_desc" | "popular";

export type PublishedCourseFilters = {
  query?: string;
  subjectId?: string;
  subjectSlug?: string;
  level?: CourseLevel;
  minPriceCents?: number;
  maxPriceCents?: number;
  sort?: CourseSort;
  page?: number;
  pageSize?: number;
};

function courseOrderBy(sort: CourseSort = "newest"): Prisma.CourseOrderByWithRelationInput[] {
  if (sort === "price_asc") return [{ priceCents: "asc" }, { publishedAt: "desc" }];
  if (sort === "price_desc") return [{ priceCents: "desc" }, { publishedAt: "desc" }];
  if (sort === "popular") {
    return [{ enrollments: { _count: "desc" } }, { publishedAt: "desc" }];
  }
  return [{ publishedAt: "desc" }, { createdAt: "desc" }];
}

export async function searchPublishedCourses(filters: PublishedCourseFilters = {}) {
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize ?? 24)));
  const query = filters.query?.trim();
  const where: Prisma.CourseWhereInput = {
    status: "published",
    deletedAt: null,
    teacher: { deletedAt: null },
    ...(filters.level ? { level: filters.level } : {}),
    ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    ...(filters.subjectSlug ? { subject: { slug: filters.subjectSlug } } : {}),
    ...(filters.minPriceCents !== undefined || filters.maxPriceCents !== undefined
      ? {
          priceCents: {
            ...(filters.minPriceCents !== undefined
              ? { gte: Math.max(0, Math.trunc(filters.minPriceCents)) }
              : {}),
            ...(filters.maxPriceCents !== undefined
              ? { lte: Math.max(0, Math.trunc(filters.maxPriceCents)) }
              : {}),
          },
        }
      : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
            { teacher: { name: { contains: query, mode: "insensitive" } } },
            { subject: { name: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [courses, total] = await db.$transaction([
    db.course.findMany({
      where,
      orderBy: courseOrderBy(filters.sort),
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        coverImageUrl: true,
        priceCents: true,
        currency: true,
        level: true,
        publishedAt: true,
        subject: { select: { id: true, name: true, slug: true } },
        teacher: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            teacherProfile: { select: { slug: true, headline: true } },
          },
        },
        _count: { select: { enrollments: true, modules: true } },
      },
    }),
    db.course.count({ where }),
  ]);

  return {
    courses,
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  };
}

export async function getPublishedCourseBySlug(slug: string) {
  return db.course.findFirst({
    where: { slug, status: "published", deletedAt: null },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      coverImageUrl: true,
      priceCents: true,
      currency: true,
      level: true,
      publishedAt: true,
      subject: { select: { id: true, name: true, slug: true } },
      teacher: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          teacherProfile: {
            select: { slug: true, headline: true, bio: true },
          },
        },
      },
      modules: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          sortOrder: true,
          lessons: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, title: true, sortOrder: true },
          },
        },
      },
      _count: { select: { enrollments: true } },
    },
  });
}

export async function getTeacherCourses(teacherId: string) {
  return db.course.findMany({
    where: { teacherId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      coverImageUrl: true,
      priceCents: true,
      currency: true,
      level: true,
      status: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      subject: { select: { id: true, name: true, slug: true } },
      _count: { select: { modules: true, enrollments: true, purchases: true } },
    },
  });
}

export async function getCourseForTeacherEdit(courseId: string, teacherId: string) {
  return db.course.findFirst({
    where: { id: courseId, teacherId, deletedAt: null },
    include: {
      subject: { select: { id: true, name: true, slug: true } },
      modules: {
        orderBy: { sortOrder: "asc" },
        include: {
          lessons: {
            orderBy: { sortOrder: "asc" },
            include: {
              assets: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] },
            },
          },
        },
      },
    },
  });
}

export async function getStudentEnrollments(studentId: string) {
  return db.courseEnrollment.findMany({
    where: { studentId, revokedAt: null, course: { deletedAt: null } },
    orderBy: { enrolledAt: "desc" },
    select: {
      id: true,
      enrolledAt: true,
      course: {
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          coverImageUrl: true,
          level: true,
          certificateEnabled: true,
          teacher: { select: { id: true, name: true, avatarUrl: true } },
          certificates: {
            where: { studentId },
            select: { id: true, verificationCode: true, issuedAt: true },
          },
          modules: {
            select: {
              lessons: {
                select: {
                  id: true,
                  progress: {
                    where: { studentId, completedAt: { not: null } },
                    select: { id: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}

export async function getEnrolledCourseDetail(courseId: string, studentId: string) {
  const enrollment = await db.courseEnrollment.findFirst({
    where: { courseId, studentId, revokedAt: null, course: { deletedAt: null } },
    select: { id: true },
  });
  if (!enrollment) return null;

  return db.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      coverImageUrl: true,
      level: true,
      certificateEnabled: true,
      teacher: { select: { id: true, name: true, avatarUrl: true } },
      certificates: {
        where: { studentId },
        select: { id: true, verificationCode: true, issuedAt: true },
      },
      modules: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          sortOrder: true,
          lessons: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              title: true,
              content: true,
              videoUrl: true,
              fileName: true,
              fileMimeType: true,
              sortOrder: true,
              assets: {
                orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
                select: {
                  id: true,
                  kind: true,
                  fileName: true,
                  mimeType: true,
                  sizeBytes: true,
                  sortOrder: true,
                },
              },
              progress: {
                where: { studentId },
                select: { completedAt: true },
              },
            },
          },
        },
      },
    },
  });
}

export async function getCourseModerationQueue() {
  return db.course.findMany({
    where: { status: "pending_approval", deletedAt: null },
    orderBy: [{ submittedAt: "asc" }, { updatedAt: "asc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      coverImageUrl: true,
      priceCents: true,
      currency: true,
      level: true,
      status: true,
      submittedAt: true,
      updatedAt: true,
      certificateEnabled: true,
      subject: { select: { id: true, name: true, slug: true } },
      teacher: {
        select: {
          id: true,
          name: true,
          email: true,
          teacherProfile: { select: { slug: true, headline: true } },
        },
      },
      _count: { select: { modules: true, enrollments: true } },
    },
  });
}

export async function getCourseForAdminReview(courseId: string) {
  return db.course.findFirst({
    where: { id: courseId, deletedAt: null },
    include: {
      subject: { select: { id: true, name: true, slug: true } },
      teacher: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
          teacherProfile: { select: { slug: true, headline: true, bio: true } },
        },
      },
      modules: {
        orderBy: { sortOrder: "asc" },
        include: {
          lessons: {
            orderBy: { sortOrder: "asc" },
            include: {
              assets: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] },
            },
          },
        },
      },
      _count: { select: { enrollments: true, purchases: true, certificates: true } },
    },
  });
}

export async function getLessonDownloadAccess(lessonId: string, userId: string) {
  const lesson = await db.courseLesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      fileStoragePath: true,
      fileName: true,
      fileMimeType: true,
      module: {
        select: {
          course: {
            select: {
              id: true,
              teacherId: true,
              deletedAt: true,
              enrollments: {
                where: { studentId: userId, revokedAt: null },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!lesson || lesson.module.course.deletedAt) {
    throw new NotFoundError("Lesson file not found.");
  }
  const isTeacher = lesson.module.course.teacherId === userId;
  const isEnrolled = lesson.module.course.enrollments.length > 0;
  if (!isTeacher && !isEnrolled) {
    throw new ForbiddenError("Enroll in this course to download lesson files.");
  }
  if (!lesson.fileStoragePath) throw new NotFoundError("This lesson has no file.");

  return {
    lessonId: lesson.id,
    courseId: lesson.module.course.id,
    storagePath: lesson.fileStoragePath,
    fileName: lesson.fileName,
    mimeType: lesson.fileMimeType,
  };
}
