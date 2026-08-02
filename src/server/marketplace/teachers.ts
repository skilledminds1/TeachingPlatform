import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

/**
 * What makes a teacher profile publicly visible.
 *
 * One definition, spread into every query that needs it, because there are now three: the
 * marketplace list, the profile page, and the sitemap (GLO-02). A sitemap built from a
 * fourth hand-written copy would eventually advertise profiles the marketplace hides — and
 * the drift would surface as a crawler 404, long after the change that caused it.
 *
 * QLT-11: `isDemo` is an explicit flag rather than a seed-email suffix. See User.isDemo.
 */
export const PUBLIC_TEACHER_WHERE = {
  status: "approved",
  deletedAt: null,
  user: { isDemo: false },
  organization: { plan: { marketplaceListing: true }, deletedAt: null },
} as const satisfies Prisma.TeacherProfileWhereInput;

export type TeacherSort = "recommended" | "price_asc" | "price_desc" | "rating" | "newest";

export type TeacherSearchFilters = {
  query?: string;
  subject?: string;
  maxRateCents?: number;
  minRating?: number;
  /** INT-10: BCP-47 code. The primary axis students search on in an international market. */
  language?: string;
  sort?: TeacherSort;
  /** QLT-08: 1-based. Without it, teacher 61 onwards was unreachable entirely. */
  page?: number;
  pageSize?: number;
};

// INT-12: order by the USD-normalised rate. Ordering by hourlyRateCents mixed currencies,
// so "price: low to high" ranked a EUR 40 teacher below a USD 45 one despite costing more.
//
// QLT-08: "rating" used to map to submittedAt here and get re-sorted in memory afterwards,
// which meant it ranked the 60 most recently submitted teachers rather than the platform's
// best. It orders by the denormalised column now, nulls last so an unreviewed teacher does
// not outrank a well-reviewed one.
const orderBy: Record<TeacherSort, Prisma.TeacherProfileOrderByWithRelationInput[]> = {
  recommended: [{ submittedAt: "desc" }],
  price_asc: [{ hourlyRateUsdCents: "asc" }],
  price_desc: [{ hourlyRateUsdCents: "desc" }],
  rating: [
    { ratingAverage: { sort: "desc", nulls: "last" } },
    { ratingCount: "desc" },
    { submittedAt: "desc" },
  ],
  newest: [{ createdAt: "desc" }],
};

/** QLT-08: a page of teachers, not the whole marketplace. */
const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 60;

export async function searchTeachers(filters: TeacherSearchFilters) {
  const where: Prisma.TeacherProfileWhereInput = { ...PUBLIC_TEACHER_WHERE };

  if (filters.query) {
    where.OR = [
      { headline: { contains: filters.query, mode: "insensitive" } },
      { bio: { contains: filters.query, mode: "insensitive" } },
      { user: { name: { contains: filters.query, mode: "insensitive" } } },
      {
        subjects: {
          some: { subject: { name: { contains: filters.query, mode: "insensitive" } } },
        },
      },
    ];
  }
  // INT-10: a student needs a teacher they can actually talk to. Without this filter they
  // could narrow by subject and price and still land on someone with no shared language.
  if (filters.language) {
    where.languages = { some: { code: filters.language } };
  }
  if (filters.subject) {
    where.subjects = { some: { subject: { slug: filters.subject } } };
  }
  // INT-12: the bucket labels are written in dollars ("Up to $50/hour"), so compare against
  // the USD-normalised column rather than each teacher's own units.
  if (filters.maxRateCents) {
    where.hourlyRateUsdCents = { lte: filters.maxRateCents };
  }
  // QLT-08: filtered in SQL. In memory over 60 rows, this could return an empty page while
  // plenty of matching teachers existed further down the list.
  if (filters.minRating) {
    where.ratingAverage = { gte: filters.minRating };
  }

  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.trunc(filters.pageSize ?? DEFAULT_PAGE_SIZE)),
  );

  // QLT-08: a bounded page plus a total, replacing a hard `take: 60` with no pagination at
  // all — which made every teacher past the 60th unreachable through the UI.
  const [total, profiles] = await Promise.all([
    db.teacherProfile.count({ where }),
    db.teacherProfile.findMany({
      where,
      orderBy: orderBy[filters.sort ?? "recommended"],
      take: pageSize,
      skip: (page - 1) * pageSize,
      select: {
        id: true,
      slug: true,
      headline: true,
      bio: true,
      hourlyRateCents: true,
      hourlyRateUsdCents: true,
      currency: true,
      userId: true,
      user: { select: { name: true, avatarUrl: true } },
      subjects: { select: { subject: { select: { name: true, slug: true } } } },
      languages: { select: { code: true, proficiency: true } },
      // QLT-08: the aggregates the filter and sort above already used.
      ratingAverage: true,
      ratingCount: true,
    },
    }),
  ]);

  // QLT-08: the per-page groupBy over reviews is gone — the aggregate is a column now, and
  // the filter and sort that need it ran in SQL above. The shape callers consume is kept.
  const teachers = profiles.map(({ ratingAverage, ratingCount, ...profile }) => ({
    ...profile,
    rating: {
      average: ratingAverage === null ? 0 : Number(ratingAverage),
      count: ratingCount,
    },
  }));

  return {
    teachers,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getMarketplaceSubjects() {
  return db.subject.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });
}

export async function getTeacherBySlug(slug: string) {
  const profile = await db.teacherProfile.findFirst({
    where: { slug, ...PUBLIC_TEACHER_WHERE },
    select: {
      id: true,
      slug: true,
      headline: true,
      bio: true,
      introVideoUrl: true,
      hourlyRateCents: true,
      currency: true,
      userId: true,
      submittedAt: true,
      createdAt: true,
      user: {
        select: {
          name: true,
          avatarUrl: true,
          timezone: true,
          availabilitySlots: {
            orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
            select: { dayOfWeek: true, startTime: true, endTime: true },
          },
        },
      },
      subjects: {
        select: {
          specialties: true,
          subject: { select: { name: true, slug: true } },
        },
      },
      qualifications: {
        where: { status: { not: "rejected" } },
        orderBy: { issuedYear: "desc" },
        select: {
          id: true,
          title: true,
          institution: true,
          issuedYear: true,
          status: true,
        },
      },
    },
  });

  if (!profile) return null;

  const [ratingAggregate, reviews] = await Promise.all([
    db.review.aggregate({
      where: { teacherId: profile.userId, status: "approved" },
      _avg: { rating: true },
      _count: true,
    }),
    db.review.findMany({
      where: { teacherId: profile.userId, status: "approved" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        rating: true,
        comment: true,
        teacherResponse: true,
        createdAt: true,
        student: { select: { name: true } },
      },
    }),
  ]);

  return {
    ...profile,
    rating: {
      average: ratingAggregate._avg.rating ?? 0,
      count: ratingAggregate._count,
    },
    reviews,
  };
}
