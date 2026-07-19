import {
  BadgeCheck,
  GraduationCap,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SlotPicker } from "@/features/bookings/components/slot-picker";
import { MessageTeacherButton } from "@/features/messaging/components/message-teacher-button";
import { RatingStars } from "@/features/marketplace/components/rating-stars";
import { formatCurrency, formatDate } from "@/lib/format";
import { getAvailableSlots } from "@/server/availability/slots";
import { getCurrentUser } from "@/server/auth/session";
import { getTeacherBySlug } from "@/server/marketplace/teachers";

const dayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatTime(time: Date): string {
  return new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(time);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const teacher = await getTeacherBySlug(slug);
  if (!teacher) return { title: "Teacher not found" };
  return {
    title: `${teacher.user.name} — ${teacher.headline ?? "Teacher"}`,
    description: teacher.bio.slice(0, 160),
  };
}

export async function TeacherProfileContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [teacher, user, available] = await Promise.all([
    getTeacherBySlug(slug),
    getCurrentUser(),
    getAvailableSlots(slug),
  ]);
  if (!teacher) notFound();

  const availabilityByDay = new Map<number, Array<{ start: Date; end: Date }>>();
  for (const slot of teacher.user.availabilitySlots) {
    const slots = availabilityByDay.get(slot.dayOfWeek) ?? [];
    slots.push({ start: slot.startTime, end: slot.endTime });
    availabilityByDay.set(slot.dayOfWeek, slots);
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="font-semibold tracking-tight">
            Amazing Skills
          </Link>
          <Button variant="ghost" render={<Link href="/find-tutor" />}>
            Back to all teachers
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <Avatar className="size-20 shrink-0">
                  {teacher.user.avatarUrl ? (
                    <AvatarImage src={teacher.user.avatarUrl} alt="" />
                  ) : null}
                  <AvatarFallback className="text-xl">
                    {teacher.user.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight">
                      {teacher.user.name}
                    </h1>
                    <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-500">
                      <ShieldCheck className="size-3.5" aria-hidden />
                      Verified
                    </span>
                  </div>
                  {teacher.headline ? (
                    <p className="text-muted-foreground">{teacher.headline}</p>
                  ) : null}
                  <RatingStars
                    average={teacher.rating.average}
                    count={teacher.rating.count}
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {teacher.subjects.map(({ subject, specialties }) => (
                      <div key={subject.slug} className="flex flex-wrap items-center gap-1.5">
                        <Link
                          href={`/find-tutor?subject=${subject.slug}`}
                          className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        >
                          {subject.name}
                        </Link>
                        {specialties.map((specialty) => (
                          <span
                            key={`${subject.slug}-${specialty}`}
                            className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground"
                          >
                            {specialty}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="font-semibold">About</h2>
              <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                {teacher.bio}
              </p>
            </section>

            {teacher.qualifications.length > 0 ? (
              <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h2 className="font-semibold">Qualifications</h2>
                <ul className="mt-4 space-y-3">
                  {teacher.qualifications.map((qualification) => (
                    <li key={qualification.id} className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-lg bg-primary/10 p-1.5 text-primary">
                        <GraduationCap className="size-4" aria-hidden />
                      </div>
                      <div>
                        <p className="flex items-center gap-1.5 text-sm font-medium">
                          {qualification.title}
                          {qualification.status === "verified" ? (
                            <BadgeCheck
                              className="size-3.5 text-emerald-500"
                              aria-label="Verified qualification"
                            />
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {qualification.institution} · {qualification.issuedYear}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <h2 className="font-semibold">
                Reviews{teacher.rating.count > 0 ? ` (${teacher.rating.count})` : ""}
              </h2>
              {teacher.reviews.length > 0 ? (
                <ul className="mt-4 space-y-5">
                  {teacher.reviews.map((review) => (
                    <li key={review.id} className="space-y-2 border-b border-border pb-5 last:border-b-0 last:pb-0">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">{review.student.name}</p>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(review.createdAt)}
                        </span>
                      </div>
                      <RatingStars average={review.rating} count={1} showCount={false} />
                      <p className="text-sm text-muted-foreground">{review.comment}</p>
                      {review.teacherResponse ? (
                        <div className="mt-2 rounded-lg bg-muted/50 p-3">
                          <p className="text-xs font-medium">Response from {teacher.user.name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {review.teacherResponse}
                          </p>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <MessageSquare className="size-4" aria-hidden />
                  No reviews yet. Reviews appear after students complete moderated lessons.
                </p>
              )}
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-xl border border-border bg-card p-6 shadow-sm lg:sticky lg:top-6">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold tracking-tight">
                  {formatCurrency(teacher.hourlyRateCents, teacher.currency)}
                </span>
                <span className="text-sm text-muted-foreground">/ hour</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Paid directly to the teacher — no platform markup.
              </p>
              <div className="mt-5 space-y-3">
                <SlotPicker
                  teacherSlug={teacher.slug}
                  slots={available?.slots ?? []}
                  teacherTimeZone={available?.timeZone ?? teacher.user.timezone}
                  viewerTimeZone={user?.timezone ?? "Africa/Johannesburg"}
                  signedIn={Boolean(user)}
                />
                {user && user.id !== teacher.userId ? (
                  <MessageTeacherButton teacherUserId={teacher.userId} />
                ) : null}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Reserving creates a pending booking. Student checkout will be enabled in the
                payments phase.
              </p>
            </section>

            {availabilityByDay.size > 0 ? (
              <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
                <h2 className="font-semibold">Weekly availability</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Times shown in the teacher&apos;s timezone ({teacher.user.timezone}).
                </p>
                <ul className="mt-4 space-y-2">
                  {[...availabilityByDay.entries()].map(([day, slots]) => (
                    <li key={day} className="flex items-start justify-between gap-3 text-sm">
                      <span className="font-medium">{dayNames[day] ?? `Day ${day}`}</span>
                      <span className="text-right text-muted-foreground">
                        {slots
                          .map((slot) => `${formatTime(slot.start)}–${formatTime(slot.end)}`)
                          .join(", ")}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}

export default async function TeacherProfileRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, queryParams] = await Promise.all([params, searchParams]);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(queryParams)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(key, item));
    else if (value !== undefined) query.set(key, value);
  }
  permanentRedirect(
    `/find-tutor/${encodeURIComponent(slug)}${query.size ? `?${query.toString()}` : ""}`,
  );
}
