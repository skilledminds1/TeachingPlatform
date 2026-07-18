import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { requireTeacher } from "@/server/auth/session";

export async function getTeacherPaymentSettings() {
  const user = await requireTeacher();
  const accounts = await db.teacherPaymentAccount.findMany({
    where: {
      userId: user.id,
      isActive: true,
      providerAccountId: { not: { startsWith: "local_" } },
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      provider: true,
      providerAccountId: true,
      isDefault: true,
      updatedAt: true,
    },
  });

  return {
    accounts: accounts.map((account) => ({
      ...account,
      maskedAccountId: `••••${account.providerAccountId.slice(-6)}`,
    })),
    configured: {
      stripe: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_CONNECT_CLIENT_ID),
      paypal: Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET),
    },
  };
}
