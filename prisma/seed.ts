import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
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
    "courses",
    "unlimited_courses",
    "quizzes",
    "assignments",
    "certificates",
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
      monthlyPriceCents: 0,
      annualPriceCents: 0,
      currency: "USD",
      studentLimit: 1,
      monthlyLiveLessonMinutes: 120,
      courseLimit: 0,
      features: freeFeatures,
      marketplaceListing: true,
      videoSessions: true,
      teacherPayments: true,
    },
    {
      name: "Starter",
      slug: "starter",
      monthlyPriceCents: 900,
      annualPriceCents: 9000,
      currency: "USD",
      studentLimit: 5,
      monthlyLiveLessonMinutes: 1200,
      courseLimit: 0,
      features: starterFeatures,
      marketplaceListing: true,
      videoSessions: true,
      teacherPayments: true,
    },
    {
      name: "Professional",
      slug: "professional",
      monthlyPriceCents: 1900,
      annualPriceCents: 19000,
      currency: "USD",
      studentLimit: 15,
      monthlyLiveLessonMinutes: 4500,
      courseLimit: null,
      features: professionalFeatures,
      marketplaceListing: true,
      videoSessions: true,
      teacherPayments: true,
    },
    {
      name: "Business",
      slug: "business",
      monthlyPriceCents: 3900,
      annualPriceCents: 39000,
      currency: "USD",
      studentLimit: null,
      monthlyLiveLessonMinutes: null,
      courseLimit: null,
      features: [
        ...professionalFeatures,
        "team_teachers",
        "custom_branding",
        "api_access",
        "white_label_certificates",
        "advanced_reporting",
        "automation",
        "early_access",
      ],
      marketplaceListing: true,
      videoSessions: true,
      teacherPayments: true,
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: plan,
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
