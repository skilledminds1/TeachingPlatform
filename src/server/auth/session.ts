import type { User as AuthUser } from "@supabase/supabase-js";
import type { OrgRole, User } from "@prisma/client";

import { db } from "@/lib/db";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import type { RegisterRole } from "@/lib/validations/auth";
import { slugify } from "@/utils/slugify";

export type SessionUser = User & {
  memberships: Array<{
    role: OrgRole;
    organizationId: string;
    organization: { id: string; name: string; slug: string };
  }>;
};

function resolveDisplayName(authUser: AuthUser): string {
  const metadata = authUser.user_metadata ?? {};
  const fromMeta =
    (typeof metadata.name === "string" && metadata.name.trim()) ||
    (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
    null;

  if (fromMeta) return fromMeta;

  const email = authUser.email ?? "user";
  return email.split("@")[0] ?? "User";
}

function resolveAvatarUrl(authUser: AuthUser): string | null {
  const metadata = authUser.user_metadata ?? {};
  if (typeof metadata.avatar_url === "string") return metadata.avatar_url;
  if (typeof metadata.picture === "string") return metadata.picture;
  return null;
}

export async function syncUserFromAuth(
  authUser: AuthUser,
  options?: { role?: RegisterRole },
): Promise<User> {
  const email = authUser.email;
  if (!email) {
    throw new UnauthorizedError("Authenticated user is missing an email address.");
  }

  const name = resolveDisplayName(authUser);
  const avatarUrl = resolveAvatarUrl(authUser);

  const existing = await db.user.findUnique({ where: { id: authUser.id } });

  let user: User;

  if (existing) {
    user = await db.user.update({
      where: { id: authUser.id },
      data: {
        email,
        name: existing.name || name,
        avatarUrl: avatarUrl ?? existing.avatarUrl,
      },
    });
  } else {
    const byEmail = await db.user.findUnique({ where: { email } });
    if (byEmail && byEmail.id !== authUser.id) {
      throw new ForbiddenError(
        "An account with this email already exists. Sign in with the original method or contact support.",
      );
    }

    user = await db.user.create({
      data: {
        id: authUser.id,
        email,
        name,
        avatarUrl,
      },
    });
  }

  if (options?.role === "teacher") {
    const membershipCount = await db.organizationMember.count({
      where: { userId: user.id },
    });
    if (membershipCount === 0) {
      await provisionSoloTeacherOrganization(user);
    }
  }

  return user;
}

async function provisionSoloTeacherOrganization(user: User): Promise<void> {
  const freePlan = await db.plan.findUniqueOrThrow({ where: { slug: "free" } });
  const base = slugify(user.name) || "teacher";
  const slug = `${base}-${user.id.slice(0, 8)}`;

  await db.organization.create({
    data: {
      name: `${user.name}'s Teaching`,
      slug,
      planId: freePlan.id,
      members: {
        create: {
          userId: user.id,
          role: "admin",
        },
      },
    },
  });
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const authUser = await getAuthUser();
  if (!authUser) return null;

  await syncUserFromAuth(authUser);

  return db.user.findUnique({
    where: { id: authUser.id },
    include: {
      memberships: {
        include: {
          organization: {
            select: { id: true, name: true, slug: true },
          },
        },
      },
    },
  });
}

export async function requireAuth(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new UnauthorizedError();
  }
  return user;
}

export async function requirePlatformAdmin(): Promise<SessionUser> {
  const user = await requireAuth();
  if (!user.isPlatformAdmin) {
    throw new ForbiddenError("Platform admin access required.");
  }
  return user;
}

export async function requireOrgMembership(
  organizationId: string,
  allowedRoles?: OrgRole[],
): Promise<SessionUser> {
  const user = await requireAuth();
  const membership = user.memberships.find((m) => m.organizationId === organizationId);

  if (!membership) {
    throw new ForbiddenError("You are not a member of this organization.");
  }

  if (allowedRoles && !allowedRoles.includes(membership.role)) {
    throw new ForbiddenError("You do not have the required organization role.");
  }

  return user;
}

export function getPostAuthRedirect(user: SessionUser): string {
  if (user.isPlatformAdmin) return "/admin";

  const isTeacher = user.memberships.some(
    (m) => m.role === "admin" || m.role === "instructor",
  );

  if (isTeacher) return "/dashboard/teacher";
  return "/dashboard";
}
