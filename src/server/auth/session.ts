import { cache } from "react";
import type { User as AuthUser } from "@supabase/supabase-js";
import { isValidIanaTimeZone } from "@/lib/timezone-validation";
import type { OrgRole, Prisma, User } from "@prisma/client";
import { redirect } from "next/navigation";

import { toCountryCode } from "@/lib/countries";
import { db, type DbTransactionClient } from "@/lib/db";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { registerRoleSchema, type RegisterRole } from "@/lib/validations/auth";
import { importProviderAvatar } from "@/server/auth/provider-avatar";
import { hasCurrentLegalAcceptances } from "@/server/legal/acceptance";
import { slugify } from "@/utils/slugify";

type DbClient = DbTransactionClient | typeof db;

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

/** The URL the identity provider claims for this user's picture. Never stored, see below. */
function resolveProviderAvatarUrl(authUser: AuthUser): string | null {
  const metadata = authUser.user_metadata ?? {};
  if (typeof metadata.avatar_url === "string") return metadata.avatar_url;
  if (typeof metadata.picture === "string") return metadata.picture;
  return null;
}

/**
 * SEC-18: User.avatarUrl is always a first-party URL.
 *
 * The provider's URL is only ever an instruction to go and fetch the bytes, and only when the
 * account has no avatar of its own — it never overwrites one. That ordering matters twice
 * over: it is what keeps the googleusercontent.com host off the public tutor listing (see
 * src/server/auth/provider-avatar.ts for why importing beats widening img-src), and it fixes
 * the clobber that came with reading the field back out of provider metadata on every
 * request. uploadTeacherAvatar writes only the User row, so a teacher who signed in with
 * Google and then uploaded a profile photo had it silently replaced by their Google picture
 * on the very next page view.
 */
async function resolveStoredAvatarUrl(input: {
  userId: string;
  existingAvatarUrl: string | null;
  authUser: AuthUser;
}): Promise<string | null> {
  if (input.existingAvatarUrl) return input.existingAvatarUrl;
  return importProviderAvatar({
    userId: input.userId,
    url: resolveProviderAvatarUrl(input.authUser),
  });
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
  options?: {
    role?: RegisterRole;
    timeZone?: string | null;
    country?: string | null;
    dateOfBirth?: Date | null;
  },
): Promise<User> {
  const email = authUser.email;
  if (!email) {
    throw new UnauthorizedError("Authenticated user is missing an email address.");
  }

  const name = resolveDisplayName(authUser);
  const role = resolveRegisterRole(authUser, options?.role);

  const existing = await db.user.findUnique({ where: { id: authUser.id } });

  if (existing) {
    const user = await db.user.update({
      where: { id: authUser.id },
      data: {
        email,
        name: existing.name || name,
        avatarUrl: await resolveStoredAvatarUrl({
          userId: authUser.id,
          existingAvatarUrl: existing.avatarUrl,
          authUser,
        }),
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
  // INT-13: the country the user picked at registration, normalised. Nullable in the
  // column because every pre-existing account predates the field and is backfilled by a
  // prompt rather than by a guess.
  const country = toCountryCode(options?.country) ?? undefined;
  // Stated at registration, and the input to every guardian-consent gate. Nullable for the
  // same reason as country: existing accounts predate it, and "not stated" must not be read
  // as "adult" — which is exactly what the old confirmedAdult checkbox did.
  const dateOfBirth = options?.dateOfBirth ?? undefined;

  // Imported before the row exists, which is safe because the row's id IS the auth id, so the
  // storage path is known in advance. Keeping it outside the transaction means a network
  // fetch never holds one open.
  const avatarUrl = await resolveStoredAvatarUrl({
    userId: authUser.id,
    existingAvatarUrl: null,
    authUser,
  });

  return db.$transaction(async (transaction) => {
    const user = await transaction.user.create({
      data: {
        id: authUser.id,
        email,
        name,
        avatarUrl,
        ...(timezone ? { timezone } : {}),
        ...(country ? { country } : {}),
        ...(dateOfBirth ? { dateOfBirth } : {}),
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

/**
 * QLT-06: memoised per request.
 *
 * Every call was a fresh network round trip to Supabase, and a single page render reaches
 * the session from the layout, the page and often an action too. React's cache() scopes the
 * result to one request, so those become one call.
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

const sessionUserInclude = {
  memberships: {
    include: {
      organization: {
        select: { id: true, name: true, slug: true },
      },
    },
  },
} as const;

/**
 * Resolve the signed-in user (QLT-06).
 *
 * WHAT THIS USED TO COST, per call: a Supabase round trip, a findUnique, an UNCONDITIONAL
 * db.user.update writing email/name/avatarUrl (which also bumped updatedAt), an
 * organizationMember.count for teachers, and then a third query re-fetching the user with
 * memberships. Nothing was memoised, and call sites stack — the teacher dashboard layout
 * calls requireTeacher() and then getCurrentUser() again, so one render paid all of it
 * twice, before the page's own data began loading, across ~80 call sites.
 *
 * Three changes, in order of how much they save:
 *
 *  1. cache() — the layout, the page and any action in the same request share one
 *     resolution instead of repeating the whole sequence.
 *  2. Compare before writing. The update only fires when a field actually differs, so a
 *     normal request performs no writes at all. A write per page view is not just slow: it
 *     makes updatedAt meaningless as a signal and puts every read behind the primary.
 *  3. One query instead of three. The user is fetched once, WITH memberships, and the
 *     teacher-organisation backfill is decided from those rows rather than a separate count.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const authUser = await getAuthUser();
  if (!authUser) return null;

  const existing = await db.user.findUnique({
    where: { id: authUser.id },
    include: sessionUserInclude,
  });

  // First sight of this account — the create path, which is genuinely a write.
  if (!existing) {
    await syncUserFromAuth(authUser);
    return db.user.findUnique({
      where: { id: authUser.id },
      include: sessionUserInclude,
    });
  }

  const email = authUser.email;
  if (!email) {
    throw new UnauthorizedError("Authenticated user is missing an email address.");
  }

  // Only the fields the provider owns, and only when they have actually changed. The name
  // is preserved once set, matching what syncUserFromAuth has always done — a user who
  // edited their name should not have it overwritten from the identity provider.
  //
  // SEC-18: avatarUrl is no longer synced here at all. It is owned by the upload actions and
  // seeded once, at sign-in, by syncUserFromAuth. Re-reading it from provider metadata on
  // every request is what put a googleusercontent.com URL — blocked by img-src — onto the
  // public tutor listing, and it also reverted any photo a Google teacher had uploaded, since
  // Supabase refreshes that metadata from Google on each sign-in.
  const nextName = existing.name || resolveDisplayName(authUser);

  const changes: Prisma.UserUpdateInput = {};
  if (existing.email !== email) changes.email = email;
  if (existing.name !== nextName) changes.name = nextName;

  if (Object.keys(changes).length > 0) {
    const updated = await db.user.update({ where: { id: existing.id }, data: changes });
    Object.assign(existing, updated);
  }

  // The solo-teacher organisation backfill. Decided from the memberships already loaded, so
  // the common case — a teacher who has one — costs nothing rather than a count query on
  // every request.
  const role = resolveRegisterRole(authUser, undefined);
  const hasTeacherOrg = existing.memberships.some(
    (membership) => membership.role === "admin" || membership.role === "instructor",
  );
  if (role === "teacher" && !hasTeacherOrg) {
    await ensureSoloTeacherOrganization(existing);
    return db.user.findUnique({
      where: { id: authUser.id },
      include: sessionUserInclude,
    });
  }

  return existing;
});

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
