import { PrismaClient, OrgRole, SubscriptionStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const plans = [
    {
      name: "Free",
      slug: "free",
      priceCents: 0,
      studentLimit: 5,
      marketplaceListing: false,
      videoSessions: false,
      teacherPayments: false,
    },
    {
      name: "Pro",
      slug: "pro",
      priceCents: 29900,
      studentLimit: 50,
      marketplaceListing: true,
      videoSessions: true,
      teacherPayments: true,
    },
    {
      name: "Academy",
      slug: "academy",
      priceCents: 79900,
      studentLimit: 250,
      marketplaceListing: true,
      videoSessions: true,
      teacherPayments: true,
    },
    {
      name: "Enterprise",
      slug: "enterprise",
      priceCents: 0,
      studentLimit: 9999,
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

  const subjects = [
    { name: "Mathematics", slug: "mathematics" },
    { name: "English", slug: "english" },
    { name: "Science", slug: "science" },
    { name: "Afrikaans", slug: "afrikaans" },
    { name: "Computer Science", slug: "computer-science" },
  ];

  for (const subject of subjects) {
    await prisma.subject.upsert({
      where: { slug: subject.slug },
      update: subject,
      create: subject,
    });
  }

  const freePlan = await prisma.plan.findUniqueOrThrow({ where: { slug: "free" } });

  const platformAdmin = await prisma.user.upsert({
    where: { email: "admin@teachingplatform.local" },
    update: { isPlatformAdmin: true },
    create: {
      email: "admin@teachingplatform.local",
      name: "Platform Admin",
      isPlatformAdmin: true,
    },
  });

  const demoOrg = await prisma.organization.upsert({
    where: { slug: "demo-academy" },
    update: {},
    create: {
      name: "Demo Academy",
      slug: "demo-academy",
      planId: freePlan.id,
      subscriptionStatus: SubscriptionStatus.trialing,
    },
  });

  await prisma.organizationMember.upsert({
    where: {
      userId_organizationId: {
        userId: platformAdmin.id,
        organizationId: demoOrg.id,
      },
    },
    update: { role: OrgRole.admin },
    create: {
      userId: platformAdmin.id,
      organizationId: demoOrg.id,
      role: OrgRole.admin,
    },
  });

  console.log("Seed complete:", {
    plans: plans.length,
    subjects: subjects.length,
    platformAdmin: platformAdmin.email,
    demoOrg: demoOrg.slug,
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
