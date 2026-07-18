import { db } from "@/lib/db";
import { requireTeacher } from "@/server/auth/session";
import { getOrganizationEntitlements } from "@/server/billing/entitlements";

export async function getTeacherTeamData() {
  const user = await requireTeacher();
  const membership = user.memberships.find((item) => item.role === "admin");
  if (!membership) {
    return null;
  }

  const [organization, entitlements] = await Promise.all([
    db.organization.findUniqueOrThrow({
      where: { id: membership.organizationId },
      select: {
        id: true,
        name: true,
        members: {
          orderBy: { createdAt: "asc" },
          select: {
            role: true,
            createdAt: true,
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true },
            },
          },
        },
        invitations: {
          where: { status: "pending" },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            email: true,
            role: true,
            status: true,
            expiresAt: true,
            createdAt: true,
          },
        },
      },
    }),
    getOrganizationEntitlements(membership.organizationId),
  ]);

  return {
    organization,
    canInviteTeachers: entitlements.features.has("team_teachers"),
    plan: entitlements.plan,
  };
}
