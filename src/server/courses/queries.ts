import type { CourseLevel, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { requirePlatformAdmin } from "@/server/auth/session";
import { calculateCoursePrice, canAccessCourseMedia } from "./quality";

export type CourseSort = "newest" | "price_asc" | "price_desc" | "popular" | "rating";

export type PublishedCourseFilters = {
  query?: string;
  subjectId?: string;
  subjectSlug?: string;
  level?: CourseLevel;
  minPriceCents?: number;
  maxPriceCents?: number;
  minRating?: number;
  sort?: CourseSort;
  page?: number;
  pageSize?: number;
};

function courseOrderBy(sort: CourseSort = "newest"): Prisma.CourseOrderByWithRelationInput[] {
  if (sort === "price_asc") return [{ priceCents: "asc" }, { publishedAt: "desc" }];
  if (sort === "price_desc") return [{ priceCents: "desc" }, { publishedAt: "desc" }];
  // QLT-12: "popular" is deliberately NOT ordered here. Prisma cannot order by a FILTERED
  // relation count, so `{ enrollments: { _count: "desc" } }` counts revoked enrollments too
  // and ranked refunded courses above ones people kept. It is sorted after the fetch instead,
  // exactly as the rating and price sorts already are. QLT-07 moves all of them into SQL.
  if (sort === "popular") {
    return [{ publishedAt: "desc" }];
  }
  return [{ publishedAt: "desc" }, { createdAt: "desc" }];
}

function bestActiveSale<
  T extends {
    id: string;
    discountType: "percent" | "fixed";
    discountValue: number;
  },
>(listAmountCents: number, sales: T[]): T | null {
  return (
    sales
      .map((sale) => ({
        sale,
        discountCents: calculateCoursePrice(
          listAmountCents,
          { id: sale.id, type: sale.discountType, value: sale.discountValue },
          null,
        ).discountCents,
      }))
      .sort((a, b) => b.discountCents - a.discountCents)[0]?.sale ?? null
  );
}

export async function searchPublishedCourses(filters: PublishedCourseFilters = {}) {
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(filters.pageSize ?? 24)));
  const query = filters.query?.trim();
  const where: Prisma.CourseWhereInput = {
    status: "published",
    deletedAt: null,
    // MON-32: the catalog filtered only on soft-deletion, so a suspended or removed
    // teacher's courses stayed listed and purchasable. Enforcement has to reach discovery,
    // not just the account.
    teacher: { deletedAt: null, accountStatus: "active" },
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

  const rawCourses = await db.course.findMany({
      where,
      orderBy: courseOrderBy(filters.sort),
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
        reviews: {
          where: { status: "approved" },
          select: { rating: true },
        },
        saleCourses: {
          where: {
            sale: { active: true, startsAt: { lte: new Date() }, endsAt: { gt: new Date() } },
          },
          select: {
            sale: { select: { id: true, discountType: true, discountValue: true, endsAt: true } },
          },
        },
        // QLT-12: revoked enrollments must not count as social proof. A course that
        // sold 50 and refunded 40 was advertising "50 students enrolled" to the next
        // buyer — the strongest possible endorsement, drawn from people who asked for
        // their money back.
        _count: { select: { enrollments: { where: { revokedAt: null } }, modules: true } },
      },
    });
  const withAggregates = rawCourses.map((course) => {
    const ratingCount = course.reviews.length;
    const ratingAverage = ratingCount
      ? course.reviews.reduce((sum, review) => sum + review.rating, 0) / ratingCount
      : null;
    const sale = bestActiveSale(
      course.priceCents,
      course.saleCourses.map(({ sale: candidate }) => candidate),
    );
    const price = calculateCoursePrice(
      course.priceCents,
      sale ? { id: sale.id, type: sale.discountType, value: sale.discountValue } : null,
      null,
    );
    const { reviews: _reviews, saleCourses: _sales, ...rest } = course;
    void _reviews;
    void _sales;
    return {
      ...rest,
      ratingAverage,
      ratingCount,
      effectivePriceCents: price.amountCents,
      activeSale: sale,
    };
  });
  const filtered = withAggregates.filter(
    (course) => !filters.minRating || (course.ratingAverage ?? 0) >= filters.minRating,
  );
  if (filters.sort === "rating") {
    filtered.sort(
      (a, b) =>
        (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0) ||
        b.ratingCount - a.ratingCount,
    );
  } else if (filters.sort === "popular") {
    filtered.sort(
      (a, b) =>
        b._count.enrollments - a._count.enrollments ||
        (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
    );
  } else if (filters.sort === "price_asc" || filters.sort === "price_desc") {
    filtered.sort((a, b) =>
      filters.sort === "price_asc"
        ? a.effectivePriceCents - b.effectivePriceCents
        : b.effectivePriceCents - a.effectivePriceCents,
    );
  }
  const total = filtered.length;
  const courses = filtered.slice((page - 1) * pageSize, page * pageSize);

  return {
    courses,
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  };
}

export async function getPublishedCourseBySlug(slug: string) {
  const course = await db.course.findFirst({
    // MON-32: mirrors the catalog filter. Without it a suspended teacher's course was
    // delisted from search but still reachable — and purchasable — by direct URL.
    where: {
      slug,
      status: "published",
      deletedAt: null,
      teacher: { deletedAt: null, accountStatus: "active" },
    },
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
            select: {
              id: true,
              title: true,
              sortOrder: true,
              isPreview: true,
              content: true,
              videoUrl: true,
              fileName: true,
              assets: {
                select: {
                  id: true,
                  kind: true,
                  fileName: true,
                  mimeType: true,
                  sizeBytes: true,
                },
              },
            },
          },
        },
      },
      reviews: {
        where: { status: "approved" },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          rating: true,
          comment: true,
          teacherResponse: true,
          createdAt: true,
          student: { select: { name: true } },
        },
      },
      questions: {
        // QLT-10: isPublic is the STUDENT's consent, hidden is moderation. Both must
        // allow it. Before this, an answered question was public by default and the
        // student was never told.
        where: { isPublic: true, hidden: false, answer: { isNot: null } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          body: true,
          answer: { select: { body: true, createdAt: true } },
        },
      },
      saleCourses: {
        where: {
          sale: { active: true, startsAt: { lte: new Date() }, endsAt: { gt: new Date() } },
        },
        select: {
          sale: { select: { id: true, discountType: true, discountValue: true, endsAt: true } },
        },
      },
      // QLT-12: active enrollments only — see searchPublishedCourses.
      _count: { select: { enrollments: { where: { revokedAt: null } } } },
    },
  });
  if (!course) return null;
  const ratingCount = course.reviews.length;
  const ratingAverage = ratingCount
    ? course.reviews.reduce((sum, review) => sum + review.rating, 0) / ratingCount
    : null;
  const activeSale = bestActiveSale(
    course.priceCents,
    course.saleCourses.map(({ sale }) => sale),
  );
  const price = calculateCoursePrice(
    course.priceCents,
    activeSale
      ? {
          id: activeSale.id,
          type: activeSale.discountType,
          value: activeSale.discountValue,
        }
      : null,
    null,
  );
  const { saleCourses: _sales, ...rest } = course;
  void _sales;
  return {
    ...rest,
    modules: rest.modules.map((courseModule) => ({
      ...courseModule,
      lessons: courseModule.lessons.map((lesson) =>
        lesson.isPreview
          ? lesson
          : {
              ...lesson,
              content: "",
              videoUrl: null,
              fileName: null,
              assets: [],
            },
      ),
    })),
    ratingAverage,
    ratingCount,
    activeSale,
    effectivePriceCents: price.amountCents,
  };
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
      // QLT-12: matches getTeacherAnalytics, which already counts active enrollments
      // only. The two views sat side by side reporting different numbers.
      _count: {
        select: {
          modules: true,
          enrollments: { where: { revokedAt: null } },
          purchases: true,
        },
      },
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
      saleCourses: {
        include: { sale: true },
        orderBy: { sale: { createdAt: "desc" } },
      },
      coupons: { orderBy: { createdAt: "desc" } },
      questions: {
        orderBy: { createdAt: "desc" },
        include: { student: { select: { name: true } }, answer: true },
      },
      reviews: {
        where: { status: "approved" },
        orderBy: { createdAt: "desc" },
        include: { student: { select: { name: true } } },
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
    select: { id: true, revokedAt: true, review: true },
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
      reviews: {
        where: { enrollmentId: enrollment.id },
        select: { id: true, rating: true, comment: true, status: true, teacherResponse: true },
      },
      questions: {
        where: { hidden: false },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          body: true,
          studentId: true,
          // QLT-10: so a student can see, and change, whether their own question is public.
          isPublic: true,
          createdAt: true,
          answer: { select: { body: true, createdAt: true } },
        },
      },
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
              isPreview: true,
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
  await requirePlatformAdmin();
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
      // QLT-12: active enrollments only, consistently with every other count. A
      // moderator reading "50 enrolled" for a course with 40 revocations is misled
      // in exactly the way a buyer is.
      _count: { select: { modules: true, enrollments: { where: { revokedAt: null } } } },
    },
  });
}

export async function getCourseForAdminReview(courseId: string) {
  await requirePlatformAdmin();
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
      questions: {
        orderBy: { createdAt: "desc" },
        include: { answer: true },
      },
      // QLT-12: active enrollments only — see getCourseModerationQueue.
      _count: {
        select: {
          enrollments: { where: { revokedAt: null } },
          purchases: true,
          certificates: true,
        },
      },
    },
  });
}

export async function getLessonDownloadAccess(
  lessonId: string,
  userId?: string,
  isAdmin = false,
) {
  const lesson = await db.courseLesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      fileStoragePath: true,
      fileName: true,
      fileMimeType: true,
      isPreview: true,
      module: {
        select: {
          course: {
            select: {
              id: true,
              teacherId: true,
              status: true,
              deletedAt: true,
              enrollments: {
                where: {
                  studentId: userId ?? "00000000-0000-0000-0000-000000000000",
                  revokedAt: null,
                },
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
  if (
    !canAccessCourseMedia({
      isPreview: lesson.isPreview,
      isPublished: lesson.module.course.status === "published",
      isEnrolled,
      isTeacher,
      isAdmin,
    })
  ) {
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
