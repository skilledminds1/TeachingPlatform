import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

type AcceptStudentInput = {
  organizationId: string;
  teacherId: string;
  studentId: string;
};

export async function activateStudentRelationship(input: AcceptStudentInput) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(
        async (tx) => {
          const existing = await tx.studentRelationship.findUnique({
            where: { organizationId_teacherId_studentId: input },
            select: { id: true, status: true },
          });
          if (existing?.status === "active") {
            return { allowed: true as const, existing: true as const };
          }

          const organization = await tx.organization.findUniqueOrThrow({
            where: { id: input.organizationId },
            select: {
              plan: {
                select: { name: true, studentLimit: true },
              },
            },
          });
          const activeStudents = await tx.studentRelationship.count({
            where: { organizationId: input.organizationId, status: "active" },
          });
          const limit = organization.plan.studentLimit;

          if (limit !== null && activeStudents >= limit) {
            const recommendedPlan = await tx.plan.findFirst({
              where: { studentLimit: { gt: activeStudents } },
              orderBy: { monthlyPriceCents: "asc" },
              select: { name: true, slug: true },
            });
            return {
              allowed: false as const,
              code: "PLAN_LIMIT_EXCEEDED" as const,
              activeStudents,
              limit,
              recommendedPlan,
              message: `You've reached the limit of ${limit} active student${
                limit === 1 ? "" : "s"
              }. Upgrade to the ${recommendedPlan?.name ?? "next"} plan to continue accepting new students.`,
            };
          }

          await tx.studentRelationship.upsert({
            where: { organizationId_teacherId_studentId: input },
            update: { status: "active" },
            create: { ...input, status: "active" },
          });
          return { allowed: true as const, existing: false as const };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === 2) throw error;
    }
  }

  throw new Error("Unable to activate student relationship.");
}
