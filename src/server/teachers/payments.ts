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
      // SEC-02: report only what the flag actually permits. This previously fell back to
      // "credentials are present", so with the feature flag off the UI still offered a
      // Connect button that the server now refuses -- and, worse, that button was the route
      // to the un-CSRF-protected linking callback.
      paypal: configured.paypal,
    },
    lessonFlags: configured,
  };
}
