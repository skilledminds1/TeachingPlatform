import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { configuredLessonProviders } from "@/lib/payments/provider-flags";
import { requireTeacher } from "@/server/auth/session";

export async function getTeacherPaymentSettings() {
  const user = await requireTeacher();
  const accounts = await db.teacherPaymentAccount.findMany({
    where: {
      userId: user.id,
      provider: { in: ["payfast", "paypal"] },
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
  // Still show cards when credentials exist even if lesson flag is off (onboarding prep)
  return {
    accounts: accounts.map((account) => ({
      ...account,
      maskedAccountId: `••••${account.providerAccountId.slice(-6)}`,
    })),
    configured: {
      paypal: configured.paypal || Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET),
      payfast: configured.payfast || Boolean(env.PAYFAST_MERCHANT_ID && env.PAYFAST_MERCHANT_KEY),
    },
    lessonFlags: configured,
  };
}
