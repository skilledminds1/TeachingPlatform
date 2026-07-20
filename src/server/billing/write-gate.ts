import { db } from "@/lib/db";
import { growthBlockMessage, type LifecycleState } from "@/server/billing/lifecycle";

export function getGrowthWriteBlock(state: LifecycleState, now = new Date()): string | null {
  return growthBlockMessage(state, now);
}

export async function getOrganizationGrowthWriteBlock(
  organizationId: string,
  now = new Date(),
): Promise<string | null> {
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: {
      subscriptionStatus: true,
      trialEndsAt: true,
      graceStartedAt: true,
      graceEndsAt: true,
    },
  });
  return getGrowthWriteBlock(organization, now);
}
