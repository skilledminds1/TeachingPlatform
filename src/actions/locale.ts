"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { isSupportedLocale, LOCALE_COOKIE } from "@/i18n/locales";
import { getAuthUser } from "@/server/auth/session";
import { fail, ok, type ActionResult } from "@/types/action";

/**
 * Change the interface language (GLO-01).
 *
 * Writes BOTH the cookie and, when there is an account, the stored preference. Each covers a
 * case the other cannot: the cookie takes effect on this device immediately and works for
 * signed-out visitors, while the column is what makes the choice survive a new browser or a
 * different machine. Writing only one produces a setting that appears to forget itself.
 */
export async function setLocale(input: unknown): Promise<ActionResult<{ locale: string }>> {
  if (!isSupportedLocale(input)) {
    return fail("That language is not available.", "VALIDATION_ERROR");
  }

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, input, {
    // A language preference is not a credential; it only needs to survive and be readable by
    // the server on the next request.
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  // Signed out is a perfectly normal case here — the cookie alone is the whole mechanism.
  const authUser = await getAuthUser();
  if (authUser) {
    await db.user
      .update({ where: { id: authUser.id }, data: { locale: input } })
      // The language has already changed for this device. Failing the action because the
      // durable copy did not save would be a worse outcome than a preference that needs
      // setting again on the next device.
      .catch(() => undefined);
  }

  // Every page renders language-dependent text, so none of the cached ones are still correct.
  revalidatePath("/", "layout");
  return ok({ locale: input });
}
