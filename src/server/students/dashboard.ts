import { db } from "@/lib/db";
import { requireAuth } from "@/server/auth/session";

export async function getStudentDashboardData() {
  const user = await requireAuth();
  const now = new Date();

  const [upcomingBookings, recentBookings, teachers, stats] = await Promise.all([
    db.booking.findMany({
      where: {
        studentId: user.id,
        startsAt: { gte: now },
        status: { in: ["pending_payment", "confirmed"] },
      },
      orderBy: { startsAt: "asc" },
      take: 5,
      include: {
        teacher: { select: { id: true, name: true, avatarUrl: true } },
        videoSession: { select: { id: true, status: true } },
      },
    }),
    db.booking.findMany({
      where: {
        studentId: user.id,
        status: "completed",
      },
      orderBy: { startsAt: "desc" },
      take: 5,
      include: {
        teacher: { select: { id: true, name: true, avatarUrl: true } },
        review: { select: { id: true, rating: true, status: true } },
      },
    }),
    db.studentRelationship.findMany({
      where: { studentId: user.id, status: "active" },
      orderBy: { createdAt: "desc" },
      include: {
        teacher: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            teacherProfile: {
              select: {
                slug: true,
                headline: true,
                hourlyRateCents: true,
                currency: true,
                status: true,
              },
            },
          },
        },
      },
    }),
    db.booking.aggregate({
      where: { studentId: user.id, status: "completed" },
      _count: true,
    }),
  ]);

  return {
    user,
    upcomingBookings,
    recentBookings,
    teachers,
    completedLessons: stats._count,
    reviewsDue: recentBookings.filter((booking) => !booking.review).length,
  };
}
