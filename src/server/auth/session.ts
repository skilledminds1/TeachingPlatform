import type { User as AuthUser } from "@supabase/supabase-js";
import { isValidIanaTimeZone } from "@/lib/timezone-validation";
import type { OrgRole, Prisma, User } from "@prisma/client";
import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { registerRoleSchema, type RegisterRole } from "@/lib/validations/auth";
import { hasCurrentLegalAcceptances } from "@/server/legal/acceptance";
import { slugify } from "@/utils/slugify";

type DbClient = Prisma.TransactionClient | typeof db;

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

function resolveRegisterRole(
  authUser: AuthUser,
  explicit?: RegisterRole,
): RegisterRole | undefined {
  if (explicit) return explicit;
  const parsed = registerRoleSchema.safeParse(authUser.user_metadata?.role);
  return parsed.success ? parsed.data : undefined;
}

export function hasTeacherMembership(user: {
  memberships: Array<{ role: OrgRole }>;
}): boolean {
  return user.memberships.some(
    (membership) => membership.role === "admin" || membership.role === "instructor",
  );
}

export async function syncUserFromAuth(
  authUser: AuthUser,
  options?: { role?: RegisterRole; timeZone?: string | null },
): Promise<User> {
  const email = authUser.email;
  if (!email) {
    throw new UnauthorizedError("Authenticated user is missing an email address.");
  }

  const name = resolveDisplayName(authUser);
  const avatarUrl = resolveAvatarUrl(authUser);
  const role = resolveRegisterRole(authUser, options?.role);

  const existing = await db.user.findUnique({ where: { id: authUser.id } });

  if (existing) {
    const user = await db.user.update({
      where: { id: authUser.id },
      data: {
        email,
        name: existing.name || name,
        avatarUrl: avatarUrl ?? existing.avatarUrl,
      },
    });

    if (role === "teacher") {
      await ensureSoloTeacherOrganization(user);
    }

    return user;
  }

  const byEmail = await db.user.findUnique({ where: { email } });
  if (byEmail && byEmail.id !== authUser.id) {
    throw new ForbiddenError(
      "An account with this email already exists. Sign in with the original method or contact support.",
    );
  }

  // INT-01: store the zone the browser reported at signup. Without it every account on
  // earth inherited the Africa/Johannesburg column default, and nothing ever prompted —
  // students were never asked at all, so a New York student saw every lesson 6-7 hours off
  // until they found a buried settings form.
  const timezone = isValidIanaTimeZone(options?.timeZone) ? options?.timeZone : undefined;

  return db.$transaction(async (transaction) => {
    const user = await transaction.user.create({
      data: {
        id: authUser.id,
        email,
        name,
        avatarUrl,
        ...(timezone ? { timezone } : {}),
      },
    });

    if (role === "teacher") {
      await ensureSoloTeacherOrganization(user, transaction);
    }

    return user;
  });
}

async function ensureSoloTeacherOrganization(
  user: User,
  client: DbClient = db,
): Promise<void> {
  const teacherMembershipCount = await client.organizationMember.count({
    where: {
      userId: user.id,
      role: { in: ["admin", "instructor"] },
    },
  });
  if (teacherMembershipCount > 0) return;

  const freePlan = await client.plan.findUniqueOrThrow({ where: { slug: "free" } });
  const base = slugify(user.name) || "teacher";
  const slug = `${base}-${user.id.slice(0, 8)}`;

  await client.organization.create({
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
  const user = await requireAuthenticatedIdentity();
  if (!user.isPlatformAdmin && isAccountHardRestricted(user)) {
    redirect("/account-restricted");
  }
  return user;
}

/**
 * Authentication without account enforcement. Keep this limited to legal
 * review, restriction information, sign-out, and appeal/privacy rights flows.
 */
export async function requireAuthenticatedIdentity(): Promise<SessionUser> {
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

export async function requireTeacher(): Promise<SessionUser> {
  const user = await requireAuth();

  if (!hasTeacherMembership(user)) {
    throw new ForbiddenError("Teacher access required.");
  }
  if (!(await hasCurrentLegalAcceptances(user.id, "teacher"))) {
    throw new ForbiddenError("Current teacher agreements must be accepted.");
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

export async function getPostAuthRedirect(user: SessionUser): Promise<string> {
  if (user.isPlatformAdmin) return "/admin";

  const role: RegisterRole = hasTeacherMembership(user) ? "teacher" : "student";
  if (!(await hasCurrentLegalAcceptances(user.id, role))) {
    return "/legal-review";
  }
  if (isAccountHardRestricted(user)) {
    return "/account-restricted";
  }

  if (role === "student") return "/dashboard";

  const profile = await db.teacherProfile.findUnique({
    where: { userId: user.id },
    select: {
      status: true,
      bio: true,
      headline: true,
      hourlyRateCents: true,
      subjects: { select: { subjectId: true }, take: 1 },
      qualifications: { select: { id: true }, take: 1 },
      user: { select: { avatarUrl: true } },
    },
  });

  if (!profile || profile.status === "rejected") {
    return "/onboarding/teacher";
  }

  if (profile.status === "draft") {
    const bioWords = profile.bio.trim().split(/\s+/).filter(Boolean).length;
    const profileComplete =
      Boolean(profile.user.avatarUrl) &&
      Boolean(profile.headline) &&
      bioWords >= 100 &&
      profile.hourlyRateCents > 0 &&
      profile.subjects.length > 0 &&
      profile.qualifications.length > 0;

    return profileComplete ? "/dashboard/teacher" : "/onboarding/teacher";
  }

  return "/dashboard/teacher";
}

export function isAccountHardRestricted(
  user: Pick<User, "deletedAt" | "accountStatus" | "accountRestrictedUntil">,
): boolean {
  if (user.deletedAt || user.accountStatus === "removed") return true;
  return (
    user.accountStatus === "suspended" &&
    (!user.accountRestrictedUntil || user.accountRestrictedUntil > new Date())
  );
}
