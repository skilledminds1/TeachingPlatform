import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

export type TeacherSort = "recommended" | "price_asc" | "price_desc" | "rating" | "newest";

export type TeacherSearchFilters = {
  query?: string;
  subject?: string;
  maxRateCents?: number;
  minRating?: number;
  sort?: TeacherSort;
};

const orderBy: Record<TeacherSort, Prisma.TeacherProfileOrderByWithRelationInput> = {
  recommended: { submittedAt: "desc" },
  price_asc: { hourlyRateCents: "asc" },
  price_desc: { hourlyRateCents: "desc" },
  rating: { submittedAt: "desc" }, // re-sorted by aggregate rating below
  newest: { createdAt: "desc" },
};

export async function searchTeachers(filters: TeacherSearchFilters) {
  const where: Prisma.TeacherProfileWhereInput = {
    status: "approved",
    deletedAt: null,
    user: {
      email: { not: { endsWith: "teachingplatform.local" } },
    },
    organization: { plan: { marketplaceListing: true }, deletedAt: null },
  };

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
  if (filters.subject) {
    where.subjects = { some: { subject: { slug: filters.subject } } };
  }
  if (filters.maxRateCents) {
    where.hourlyRateCents = { lte: filters.maxRateCents };
  }

  const profiles = await db.teacherProfile.findMany({
    where,
    orderBy: orderBy[filters.sort ?? "recommended"],
    take: 60,
    select: {
      id: true,
      slug: true,
      headline: true,
      bio: true,
      hourlyRateCents: true,
      currency: true,
      userId: true,
      user: { select: { name: true, avatarUrl: true } },
      subjects: { select: { subject: { select: { name: true, slug: true } } } },
    },
  });

  const ratings = await db.review.groupBy({
    by: ["teacherId"],
    where: {
      status: "approved",
      teacherId: { in: profiles.map((profile) => profile.userId) },
    },
    _avg: { rating: true },
    _count: true,
  });
  const ratingByTeacher = new Map(
    ratings.map((entry) => [
      entry.teacherId,
      { average: entry._avg.rating ?? 0, count: entry._count },
    ]),
  );

  let results = profiles.map((profile) => ({
    ...profile,
    rating: ratingByTeacher.get(profile.userId) ?? { average: 0, count: 0 },
  }));

  if (filters.minRating) {
    results = results.filter(
      (profile) => profile.rating.count > 0 && profile.rating.average >= filters.minRating!,
    );
  }
  if (filters.sort === "rating") {
    results.sort(
      (a, b) => b.rating.average - a.rating.average || b.rating.count - a.rating.count,
    );
  }

  return results;
}

export async function getMarketplaceSubjects() {
  return db.subject.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });
}

export async function getTeacherBySlug(slug: string) {
  const profile = await db.teacherProfile.findFirst({
    where: {
      slug,
      status: "approved",
      deletedAt: null,
      user: {
        email: { not: { endsWith: "teachingplatform.local" } },
      },
      organization: { plan: { marketplaceListing: true }, deletedAt: null },
    },
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
