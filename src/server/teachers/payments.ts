import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { configuredLessonProviders } from "@/lib/payments/provider-flags";
import { requireTeacher } from "@/server/auth/session";

export async function getTeacherPaymentSettings() {
  const user = await requireTeacher();
  const accounts = await db.teacherPaymentAccount.findMany({
    where: {
      userId: user.id,
      provider: "paypal",
      providerAccountId: { not: { startsWith: "local_" } },
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      provider: true,
      providerAccountId: true,
      isDefault: true,
      isActive: true,
      onboardingStatus: true,
      settlementCurrency: true,
      country: true,
      updatedAt: true,
    },
  });

  const configured = configuredLessonProviders();
  return {
    accounts: accounts.map((account) => ({
      ...account,
      maskedAccountId: `••••${account.providerAccountId.slice(-6)}`,
    })),
    configured: {
      paypal: configured.paypal || Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET),
    },
    lessonFlags: configured,
  };
}
