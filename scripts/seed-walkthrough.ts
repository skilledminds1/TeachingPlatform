/**
 * Seed one approved teacher and one student, so the discover → book → accept → join loop can
 * be walked end to end.
 *
 *   npm run seed:walkthrough            # dry run — prints the target database and does nothing
 *   npm run seed:walkthrough -- --yes   # actually write
 *
 * SAFETY. This writes real rows and creates real Supabase Auth accounts. It refuses to run
 * unless --yes is passed, and it prints the database host first so you can see what you are
 * about to touch. It will not run at all against a URL containing a host listed in
 * PROTECTED_HOSTS unless --i-know-this-is-production is also passed, because .env.local on
 * this project points at the live database that serves amazing-skills.com.
 *
 * Everything it creates is marked `isDemo: true` (QLT-11), which is the flag the marketplace
 * and analytics already use to exclude seeded accounts — so these teachers do not appear to
 * real visitors and do not distort platform metrics. Re-running is idempotent.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

/** Hosts that must never be seeded without an explicit second acknowledgement. */
const PROTECTED_HOSTS = ["aws-0-eu-west-1.pooler.supabase.com"];

const TEACHER = {
  email: "walkthrough.teacher@teachingplatform.local",
  password: "WalkthroughTeacher!2026",
  name: "Wanda Walkthrough",
  timezone: "Africa/Johannesburg",
  country: "ZA",
};
const STUDENT = {
  email: "walkthrough.student@teachingplatform.local",
  password: "WalkthroughStudent!2026",
  name: "Sam Student",
  timezone: "Europe/London",
  country: "GB",
};

function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const i = trimmed.indexOf("=");
    let value = trimmed.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[trimmed.slice(0, i).trim()] = value;
  }
  return out;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const env = loadEnv(".env.local");
const databaseUrl = env.DATABASE_URL ?? "";
const host = databaseUrl.match(/@([^:/?]+)/)?.[1] ?? "unknown";
const apply = process.argv.includes("--yes");
const overrideProduction = process.argv.includes("--i-know-this-is-production");

async function main(): Promise<void> {
  console.log(`Target database host: ${host}`);

  if (PROTECTED_HOSTS.includes(host) && !overrideProduction) {
    console.error(
      `\nREFUSING TO RUN. ${host} is the live database serving amazing-skills.com.\n` +
        `Point DATABASE_URL at a staging project, or pass --i-know-this-is-production ` +
        `if you genuinely mean to seed demo accounts into production.`,
    );
    process.exit(1);
  }
  if (!apply) {
    console.log(
      "\nDry run. Would create:\n" +
        `  teacher  ${TEACHER.email}  (approved, listed, availability Mon–Fri)\n` +
        `  student  ${STUDENT.email}\n` +
        "\nRe-run with -- --yes to write.",
    );
    return;
  }

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  process.env.DATABASE_URL = databaseUrl;
  process.env.DIRECT_URL = env.DIRECT_URL ?? databaseUrl;
  const db = new PrismaClient();
  const auth = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /**
   * Create the auth account, or reuse it. `email_confirm: true` matters: the onboarding
   * readiness check reads `email_confirmed_at`, so an unconfirmed account can never be
   * submitted for approval and the walkthrough stops before it starts.
   */
  async function ensureAuthUser(person: typeof TEACHER, role: "teacher" | "student") {
    const { data: created, error } = await auth.auth.admin.createUser({
      email: person.email,
      password: person.password,
      email_confirm: true,
      user_metadata: { name: person.name, role },
    });
    if (!error && created.user) return created.user.id;

    // Already exists — find it rather than failing, so the script stays re-runnable.
    const { data: list, error: listError } = await auth.auth.admin.listUsers({ perPage: 1000 });
    if (listError) throw new Error(`listUsers: ${listError.message}`);
    const existing = list.users.find((u) => u.email === person.email);
    if (!existing) throw new Error(`createUser failed and no existing user: ${error?.message}`);

    await auth.auth.admin.updateUserById(existing.id, {
      password: person.password,
      email_confirm: true,
    });
    return existing.id;
  }

  const teacherAuthId = await ensureAuthUser(TEACHER, "teacher");
  const studentAuthId = await ensureAuthUser(STUDENT, "student");
  console.log(`auth users ready`);

  // --- users -------------------------------------------------------------------------
  for (const [id, person] of [
    [teacherAuthId, TEACHER],
    [studentAuthId, STUDENT],
  ] as const) {
    await db.user.upsert({
      where: { id },
      update: { name: person.name, timezone: person.timezone, country: person.country },
      create: {
        id,
        email: person.email,
        name: person.name,
        timezone: person.timezone,
        country: person.country,
        isDemo: true,
      },
    });
  }

  // --- legal acceptance ---------------------------------------------------------------
  // Without these the session resolver redirects every request to /legal-review and the
  // walkthrough never reaches a dashboard.
  const documents = await db.legalDocument.findMany({
    where: { supersededAt: null },
    select: { id: true, audience: true },
  });
  if (documents.length === 0) {
    throw new Error(
      "No current legal documents. Apply migrations first — 20260808130000_legal_documents_v2 seeds them.",
    );
  }
  for (const [userId, role] of [
    [teacherAuthId, "teacher"],
    [studentAuthId, "student"],
  ] as const) {
    await db.legalAcceptance.createMany({
      data: documents
        .filter((doc) => doc.audience === "all" || role === "teacher")
        .map((doc) => ({
          userId,
          documentId: doc.id,
          acceptedRole: role,
          method: "email_signup" as const,
          confirmedAdult: true,
        })),
      skipDuplicates: true,
    });
  }

  // --- teacher organization -----------------------------------------------------------
  const plan = await db.plan.findFirstOrThrow({
    where: { marketplaceListing: true },
    orderBy: { sortOrder: "asc" },
  });
  const orgSlug = `${slugify(TEACHER.name)}-${teacherAuthId.slice(0, 8)}`;
  const organization = await db.organization.upsert({
    where: { slug: orgSlug },
    update: { planId: plan.id },
    create: { name: `${TEACHER.name}'s Teaching`, slug: orgSlug, planId: plan.id },
  });
  await db.organizationMember.upsert({
    where: {
      userId_organizationId: { userId: teacherAuthId, organizationId: organization.id },
    },
    update: { role: "admin" },
    create: { organizationId: organization.id, userId: teacherAuthId, role: "admin" },
  });

  // --- approved teacher profile --------------------------------------------------------
  const subject = await db.subject.findFirstOrThrow({ where: { slug: "mathematics" } });
  const bio = (
    "I have taught mathematics for twelve years, most of it one to one, and I still think the " +
    "subject is mostly a confidence problem wearing a technical disguise. My lessons start by " +
    "finding the exact step where things stopped making sense, which is almost never the step " +
    "the student thinks it is. We rebuild from there. I work with school students preparing " +
    "for exams, adults returning to study after a long gap, and anyone who has been told they " +
    "are simply not a maths person and would like to prove otherwise. Sessions are calm and " +
    "unhurried. You will be asked to explain your reasoning out loud, because that is where " +
    "the misunderstanding usually surfaces, and I would rather find it in a lesson than in an " +
    "exam hall. I set short pieces of practice between sessions and I read them properly."
  ).trim();
  const profileSlug = `${slugify(TEACHER.name)}-${teacherAuthId.slice(0, 6)}`;

  const profile = await db.teacherProfile.upsert({
    where: { userId: teacherAuthId },
    update: { status: "approved", organizationId: organization.id },
    create: {
      userId: teacherAuthId,
      organizationId: organization.id,
      bio,
      headline: "Mathematics tutor — exams, foundations, and getting unstuck",
      hourlyRateCents: 45_00,
      currency: "USD",
      hourlyRateUsdCents: 45_00,
      introVideoUrl: "https://example.com/walkthrough-intro.mp4",
      introVideoPath: `${teacherAuthId}/walkthrough-intro.mp4`,
      status: "approved",
      slug: profileSlug,
      submittedAt: new Date(),
    },
  });
  await db.teacherSubject.upsert({
    where: {
      teacherProfileId_subjectId: { teacherProfileId: profile.id, subjectId: subject.id },
    },
    update: {},
    create: { teacherProfileId: profile.id, subjectId: subject.id },
  });
  const hasQualification = await db.teacherQualification.count({
    where: { teacherProfileId: profile.id },
  });
  if (hasQualification === 0) {
    await db.teacherQualification.create({
      data: {
        teacherProfileId: profile.id,
        title: "BSc Mathematics",
        institution: "University of Cape Town",
        issuedYear: 2012,
        status: "verified",
      },
    });
  }
  const hasLanguage = await db.teacherLanguage.count({ where: { teacherProfileId: profile.id } });
  if (hasLanguage === 0) {
    await db.teacherLanguage.create({
      data: { teacherProfileId: profile.id, code: "en", proficiency: "native", isNative: true },
    });
  }

  // --- availability: Mon–Fri 09:00–17:00 teacher-local ----------------------------------
  await db.availability.deleteMany({ where: { userId: teacherAuthId } });
  await db.availability.createMany({
    data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      id: randomUUID(),
      userId: teacherAuthId,
      dayOfWeek,
      // @db.Time columns take the time-of-day portion only; the date here is ignored.
      startTime: new Date("1970-01-01T09:00:00.000Z"),
      endTime: new Date("1970-01-01T17:00:00.000Z"),
    })),
  });

  await db.$disconnect();

  console.log(
    "\nSeeded.\n" +
      `  Teacher  ${TEACHER.email} / ${TEACHER.password}\n` +
      `           profile: /find-tutor/${profile.slug}  (${TEACHER.timezone})\n` +
      `  Student  ${STUDENT.email} / ${STUDENT.password}  (${STUDENT.timezone})\n` +
      "\nWalkthrough: sign in as the student, open the teacher profile, book a slot, then\n" +
      "sign in as the teacher and accept it from the booking page.",
  );
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
