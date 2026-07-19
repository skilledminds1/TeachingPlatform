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
          teacherPaymentAccounts: {
            where: {
              isActive: true,
              onboardingStatus: "complete",
              provider: "paypal",
              providerAccountId: { not: { startsWith: "local_" } },
            },
            select: { id: true },
          },
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
    paymentLinked: Boolean(profile?.user.teacherPaymentAccounts.length),
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

  const readyToSubmit =
    profileComplete &&
    checks.emailVerified &&
    checks.paymentLinked &&
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
