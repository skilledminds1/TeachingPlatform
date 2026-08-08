import { db } from "@/lib/db";
import { getAuthUser, requireTeacher } from "@/server/auth/session";

export async function getTeacherOnboardingData() {
  const user = await requireTeacher();
  const membership = user.memberships.find(
    (item) => item.role === "admin" || item.role === "instructor",
  );

  if (!membership) {
    throw new Error("Teacher organization membership is missing.");
  }

  const [subjects, profile] = await Promise.all([
    db.subject.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
    db.teacherProfile.findUnique({
      where: { userId: user.id },
      include: {
        subjects: { select: { subjectId: true, specialties: true } },
        languages: { select: { code: true, proficiency: true } },
        qualifications: {
          orderBy: { createdAt: "asc" },
          select: {
            title: true,
            institution: true,
            issuedYear: true,
            credentialUrl: true,
          },
        },
      },
    }),
  ]);

  return {
    user,
    organization: membership.organization,
    subjects,
    profile,
  };
}

export async function getTeacherProfileReadiness() {
  const user = await requireTeacher();
  const authUser = await getAuthUser();
  const profile = await db.teacherProfile.findUnique({
    where: { userId: user.id },
    include: {
      subjects: { select: { subjectId: true } },
      qualifications: { select: { id: true } },
      user: {
        select: {
          avatarUrl: true,
        },
      },
      organization: {
        select: {
          plan: {
            select: {
              name: true,
              marketplaceListing: true,
            },
          },
        },
      },
    },
  });

  const bioWordCount = profile?.bio.trim().split(/\s+/).filter(Boolean).length ?? 0;
  const checks = {
    profileCreated: Boolean(profile),
    photoAdded: Boolean(profile?.user.avatarUrl),
    biographyComplete: bioWordCount >= 100,
    subjectsSelected: Boolean(profile?.subjects.length),
    rateSet: Boolean(profile && profile.hourlyRateCents > 0),
    qualificationAdded: Boolean(profile?.qualifications.length),
    videoAdded: Boolean(profile?.introVideoUrl && profile?.introVideoPath),
    emailVerified: Boolean(authUser?.email_confirmed_at),
    paymentLinked: Boolean(profile?.paymentLinkUrl),
    qualifyingPlan: Boolean(profile?.organization.plan.marketplaceListing),
  };

  // Intentionally omit video from profileComplete so approved teachers without a
  // video (pre-migration) keep dashboard access.
  const profileComplete =
    checks.profileCreated &&
    checks.photoAdded &&
    checks.biographyComplete &&
    checks.subjectsSelected &&
    checks.rateSet &&
    checks.qualificationAdded;

  const requiresVideoForSubmission = profile?.status !== "approved";

  // PAY-15: a linked payment account is NOT a condition of being listed.
  //
  // It used to be, and that was a closed loop with no exit: submission required an account,
  // and account creation refused while the PayPal rail was disabled — which it always was,
  // by a hardcoded defect list no configuration could clear. So no teacher could ever submit
  // a profile, and the marketplace could not acquire supply at all. That rail is now deleted;
  // the ordering argument below is why the gate does not simply move to the payment link.
  //
  // Beyond the deadlock it is the wrong order. Linking a payout destination is the highest
  // friction step in onboarding, and asking for it before the platform has produced a single
  // student is asking a teacher to do paperwork on spec. The check stays in `checks` so the
  // dashboard can prompt for it, and the prompt appears where it actually matters — when a
  // booking request arrives. When the teacher payment-link model lands (PAY-07), the hard
  // gate belongs there, on accepting a lesson, not here on being discoverable.
  const readyToSubmit =
    profileComplete &&
    checks.emailVerified &&
    checks.qualifyingPlan &&
    (!requiresVideoForSubmission || checks.videoAdded);

  return {
    user,
    profile,
    checks,
    profileComplete,
    readyToSubmit,
  };
}
