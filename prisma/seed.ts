import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // Prices are in ZAR, the currency PayFast settles in. Keep these in step with
  // prisma/migrations/20260808160000_price_plans_in_zar, which re-prices existing rows —
  // this seed only creates missing plans (`update: {}`), so the two must agree or a fresh
  // environment and an existing one end up on different price lists.
  const freeFeatures = [
    "teacher_profile",
    "marketplace_listing",
    "booking_calendar",
    "direct_messaging",
    "one_on_one_lessons",
    "basic_analytics",
    "community_support",
    "direct_payments",
  ];
  const starterFeatures = [
    ...freeFeatures,
    "homework",
    "file_sharing",
    "student_notes",
    "email_reminders",
    "reviews",
    "basic_reporting",
    "custom_availability",
  ];
  const professionalFeatures = [
    ...starterFeatures,
    "quizzes",
    "assignments",
    "group_lessons",
    "calendar_sync",
    "video_integrations",
    "advanced_analytics",
    "priority_support",
  ];

  const plans = [
    {
      name: "Free",
      slug: "free",
      description: "Perfect for trying the platform.",
      monthlyPriceCents: 0,
      annualPriceCents: 0,
      currency: "ZAR",
      studentLimit: 1,
      monthlyLiveLessonMinutes: 120,
      features: freeFeatures,
      marketplaceListing: true,
      videoSessions: true,
      teacherPayments: true,
      highlighted: false,
      sortOrder: 0,
      isPublic: true,
    },
    {
      name: "Starter",
      slug: "starter",
      description: "For new tutors.",
      monthlyPriceCents: 19900,
      annualPriceCents: 199000,
      currency: "ZAR",
      studentLimit: 5,
      monthlyLiveLessonMinutes: 1200,
      features: starterFeatures,
      marketplaceListing: true,
      videoSessions: true,
      teacherPayments: true,
      highlighted: false,
      sortOrder: 1,
      isPublic: true,
    },
    {
      name: "Professional",
      slug: "professional",
      description: "For growing businesses.",
      monthlyPriceCents: 49900,
      annualPriceCents: 499000,
      currency: "ZAR",
      studentLimit: 15,
      monthlyLiveLessonMinutes: 4500,
      features: professionalFeatures,
      marketplaceListing: true,
      videoSessions: true,
      teacherPayments: true,
      highlighted: true,
      sortOrder: 2,
      isPublic: true,
    },
    {
      name: "Business",
      slug: "business",
      description: "For serious educators and schools.",
      monthlyPriceCents: 89900,
      annualPriceCents: 899000,
      currency: "ZAR",
      studentLimit: null,
      monthlyLiveLessonMinutes: null,
      features: [
        ...professionalFeatures,
        "team_teachers",
        "custom_branding",
        "api_access",
        "advanced_reporting",
        "automation",
        "early_access",
      ],
      marketplaceListing: true,
      videoSessions: true,
      teacherPayments: true,
      highlighted: false,
      sortOrder: 3,
      isPublic: true,
    },
  ];

  for (const plan of plans) {
    // Preserve admin-edited catalog values; only create missing plans.
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: {},
      create: plan,
    });
  }

  const professionalPlan = await prisma.plan.findUniqueOrThrow({
    where: { slug: "professional" },
  });
  const businessPlan = await prisma.plan.findUniqueOrThrow({
    where: { slug: "business" },
  });

  for (const [legacySlug, replacementPlanId] of [
    ["pro", professionalPlan.id],
    ["academy", businessPlan.id],
    ["enterprise", businessPlan.id],
  ] as const) {
    const legacyPlan = await prisma.plan.findUnique({ where: { slug: legacySlug } });
    if (!legacyPlan) continue;

    await prisma.organization.updateMany({
      where: { planId: legacyPlan.id },
      data: { planId: replacementPlanId },
    });
    await prisma.plan.delete({ where: { id: legacyPlan.id } });
  }

  const subjects = [
    // Core academics
    { name: "Accounting", slug: "accounting" },
    { name: "Art", slug: "art" },
    { name: "Biology", slug: "biology" },
    { name: "Business Studies", slug: "business-studies" },
    { name: "Chemistry", slug: "chemistry" },
    { name: "Computer Science", slug: "computer-science" },
    { name: "Drama", slug: "drama" },
    { name: "Economics", slug: "economics" },
    { name: "Geography", slug: "geography" },
    { name: "History", slug: "history" },
    { name: "IELTS / TOEFL", slug: "ielts-toefl" },
    { name: "Life Orientation", slug: "life-orientation" },
    { name: "Life Sciences", slug: "life-sciences" },
    { name: "Mathematics", slug: "mathematics" },
    { name: "Music", slug: "music" },
    { name: "Physical Sciences", slug: "physical-sciences" },
    { name: "Physics", slug: "physics" },
    { name: "Psychology", slug: "psychology" },
    { name: "Science", slug: "science" },
    { name: "Statistics", slug: "statistics" },
    { name: "Technology", slug: "technology" },
    // Languages
    { name: "Afrikaans", slug: "afrikaans" },
    { name: "Arabic", slug: "arabic" },
    { name: "Chinese (Mandarin)", slug: "chinese-mandarin" },
    { name: "Dutch", slug: "dutch" },
    { name: "English", slug: "english" },
    { name: "French", slug: "french" },
    { name: "German", slug: "german" },
    { name: "Greek", slug: "greek" },
    { name: "Hebrew", slug: "hebrew" },
    { name: "Hindi", slug: "hindi" },
    { name: "Italian", slug: "italian" },
    { name: "Japanese", slug: "japanese" },
    { name: "Korean", slug: "korean" },
    { name: "Latin", slug: "latin" },
    { name: "Portuguese", slug: "portuguese" },
    { name: "Russian", slug: "russian" },
    { name: "Sepedi", slug: "sepedi" },
    { name: "Sesotho", slug: "sesotho" },
    { name: "Setswana", slug: "setswana" },
    { name: "Sign Language", slug: "sign-language" },
    { name: "Spanish", slug: "spanish" },
    { name: "Swahili", slug: "swahili" },
    { name: "Swedish", slug: "swedish" },
    { name: "Turkish", slug: "turkish" },
    { name: "Ukrainian", slug: "ukrainian" },
    { name: "Urdu", slug: "urdu" },
    { name: "Xitsonga", slug: "xitsonga" },
    { name: "isiNdebele", slug: "isindebele" },
    { name: "isiXhosa", slug: "isixhosa" },
    { name: "isiZulu", slug: "isizulu" },
  ];

  for (const subject of subjects) {
    await prisma.subject.upsert({
      where: { slug: subject.slug },
      update: subject,
      create: subject,
    });
  }

  console.log("Seed complete:", {
    plans: plans.length,
    subjects: subjects.length,
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
