import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CoursePurchaseButton } from "@/features/courses/components/course-purchase-button";
import { CurriculumPreview } from "@/features/courses/components/curriculum-preview";
import { formatCourseLevel } from "@/features/courses/lib/labels";
import { StudentNavWithNotifications } from "@/features/student-dashboard/components/student-nav-with-notifications";
import { formatCurrency } from "@/lib/format";
import { getCurrentUser, hasTeacherMembership } from "@/server/auth/session";
import {
  getEnrolledCourseDetail,
  getPublishedCourseBySlug,
} from "@/server/courses/queries";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const course = await getPublishedCourseBySlug(slug);
  if (!course) return { title: "Course not found" };
  return {
    title: course.title,
    description: course.description.slice(0, 160) || `Learn ${course.title} on Amazing Skills.`,
  };
}

export default async function CourseSalesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [course, user] = await Promise.all([
    getPublishedCourseBySlug(slug),
    getCurrentUser(),
  ]);
  if (!course) notFound();

  const enrolled =
    user != null
      ? await getEnrolledCourseDetail(course.id, user.id)
      : null;

  const priceLabel =
    course.effectivePriceCents === 0
      ? "Free"
      : formatCurrency(course.effectivePriceCents, course.currency);
  const lessonCount = course.modules.reduce(
    (sum, module) => sum + module.lessons.length,
    0,
  );
  const showStudentNav =
    Boolean(user) && !user?.isPlatformAdmin && !hasTeacherMembership(user!);

  return (
    <div className="min-h-screen bg-muted/20">
      {showStudentNav ? (
        <StudentNavWithNotifications />
      ) : (
        <header className="border-b border-border bg-background">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
            <Link href="/" className="font-semibold tracking-tight">
              Amazing Skills
            </Link>
            <Button variant="ghost" render={<Link href="/courses" />}>
              Back to courses
            </Button>
          </div>
        </header>
      )}

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="aspect-[16/9] bg-muted">
                {course.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={course.coverImageUrl}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : null}
              </div>
              <div className="space-y-4 p-6">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {formatCourseLevel(course.level)}
                    {course.subject ? ` · ${course.subject.name}` : ""}
                  </p>
                  <h1 className="text-3xl font-semibold tracking-tight">{course.title}</h1>
                  {course.ratingAverage ? (
                    <p className="text-sm text-amber-600">
                      ★ {course.ratingAverage.toFixed(1)} · {course.ratingCount} review
                      {course.ratingCount === 1 ? "" : "s"}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <Avatar>
                    {course.teacher.avatarUrl ? (
                      <AvatarImage src={course.teacher.avatarUrl} alt="" />
                    ) : null}
                    <AvatarFallback>
                      {course.teacher.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{course.teacher.name}</p>
                    {course.teacher.teacherProfile?.headline ? (
                      <p className="text-sm text-muted-foreground">
                        {course.teacher.teacherProfile.headline}
                      </p>
                    ) : null}
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {course.description || "No description provided."}
                </p>
              </div>
            </section>

            {course.reviews.length > 0 ? (
              <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h2 className="text-lg font-semibold">Student reviews</h2>
                <div className="mt-4 space-y-4">
                  {course.reviews.map((review) => (
                    <article key={review.id} className="rounded-lg bg-muted/50 p-4 text-sm">
                      <p className="font-medium">{"★".repeat(review.rating)} · {review.student.name}</p>
                      <p className="mt-1 text-muted-foreground">{review.comment}</p>
                      {review.teacherResponse ? (
                        <p className="mt-3 border-l-2 border-primary pl-3">
                          Teacher response: {review.teacherResponse}
                        </p>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {course.questions.length > 0 ? (
              <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h2 className="text-lg font-semibold">Course Q&amp;A</h2>
                <p className="text-xs text-muted-foreground">Public answers omit student identity.</p>
                <div className="mt-4 space-y-3">
                  {course.questions.map((question) => (
                    <article key={question.id} className="rounded-lg bg-muted/50 p-4 text-sm">
                      <p className="font-medium">{question.body}</p>
                      <p className="mt-2 text-muted-foreground">{question.answer?.body}</p>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Curriculum</h2>
              <div className="mt-4">
                <CurriculumPreview modules={course.modules} />
              </div>
            </section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <p className="text-3xl font-semibold tracking-tight">{priceLabel}</p>
              {course.activeSale && course.effectivePriceCents < course.priceCents ? (
                <p className="text-sm">
                  <span className="text-muted-foreground line-through">
                    {formatCurrency(course.priceCents, course.currency)}
                  </span>{" "}
                  <span className="font-medium text-emerald-600">Sale ends {course.activeSale.endsAt.toLocaleDateString()}</span>
                </p>
              ) : null}
              <p className="mt-1 text-sm text-muted-foreground">
                One-time purchase · lifetime access
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Payment goes directly to the teacher. The teacher is responsible for refunds under
                our{" "}
                <Link href="/refund-policy" className="font-medium text-primary hover:underline">
                  refund policy
                </Link>
                .
              </p>
              <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
                <li>
                  {course.modules.length} module
                  {course.modules.length === 1 ? "" : "s"}
                </li>
                <li>
                  {lessonCount} lesson{lessonCount === 1 ? "" : "s"}
                </li>
                <li>
                  {course._count.enrollments} student
                  {course._count.enrollments === 1 ? "" : "s"} enrolled
                </li>
              </ul>
              <div className="mt-6">
                {user ? (
                  <CoursePurchaseButton
                    courseId={course.id}
                    priceLabel={priceLabel}
                    isFree={course.effectivePriceCents === 0}
                    enrolledHref={enrolled ? `/dashboard/courses/${course.id}` : null}
                  />
                ) : (
                  <Button
                    className="w-full"
                    size="lg"
                    render={
                      <Link href={`/login?redirect=/courses/${course.slug}`} />
                    }
                  >
                    {course.effectivePriceCents === 0 ? "Sign in to enroll" : "Sign in to purchase"}
                  </Button>
                )}
              </div>
              {course.teacher.teacherProfile?.slug ? (
                <Button
                  className="mt-3 w-full"
                  variant="outline"
                  render={
                    <Link href={`/find-tutor/${course.teacher.teacherProfile.slug}`} />
                  }
                >
                  View teacher profile
                </Button>
              ) : null}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
