import type { EnforcementScope } from "@prisma/client";

import { db } from "@/lib/db";
import { ForbiddenError } from "@/lib/errors";

export function accountRestrictionReason(user: {
  deletedAt: Date | null;
  accountStatus: string;
  accountStatusReason: string | null;
} | null): string | null {
  if (!user || user.deletedAt || user.accountStatus === "removed") {
    return "This account has been removed.";
  }
  if (user.accountStatus === "suspended") {
    return user.accountStatusReason ?? "This account is suspended.";
  }
  return null;
}

export async function getScopeRestriction(
  userId: string,
  scope: EnforcementScope,
): Promise<string | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      deletedAt: true,
      accountStatus: true,
      accountStatusReason: true,
      accountRestrictedUntil: true,
    },
  });
  if (!user) return "This account has been removed.";
  const accountRestriction = accountRestrictionReason(user);
  if (accountRestriction) return accountRestriction;
  if (
    user.accountStatus === "restricted" &&
    (!user.accountRestrictedUntil || user.accountRestrictedUntil > new Date())
  ) {
    const sanction = await db.sanction.findFirst({
      where: {
        userId,
        revokedAt: null,
        startsAt: { lte: new Date() },
        OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
        scopes: { has: scope },
      },
      orderBy: { startsAt: "desc" },
      select: { reason: true },
    });
    if (sanction) return sanction.reason;
  }

  const sanction = await db.sanction.findFirst({
    where: {
      userId,
      revokedAt: null,
      startsAt: { lte: new Date() },
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
      scopes: { has: scope },
    },
    orderBy: { startsAt: "desc" },
    select: { reason: true },
  });
  return sanction?.reason ?? null;
}

export async function assertScopeAllowed(
  userId: string,
  scope: EnforcementScope,
): Promise<void> {
  const reason = await getScopeRestriction(userId, scope);
  if (reason) throw new ForbiddenError(reason);
}

export async function usersHaveBlock(userAId: string, userBId: string): Promise<boolean> {
  return Boolean(
    await db.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: userAId, blockedId: userBId },
          { blockerId: userBId, blockedId: userAId },
        ],
      },
      select: { id: true },
    }),
  );
}

export async function assertNoUserBlock(userAId: string, userBId: string): Promise<void> {
  if (await usersHaveBlock(userAId, userBId)) {
    throw new ForbiddenError("This interaction is unavailable because one account blocked the other.");
  }
}
