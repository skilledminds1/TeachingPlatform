import { ArrowLeft, CalendarDays, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { ReviewForm } from "@/features/reviews/components/review-form";
import { SessionRoom } from "@/features/video/components/session-room";
import { formatDateTime, formatStatus } from "@/lib/format";
import { getSessionForParticipant } from "@/server/video/sessions";

export const metadata: Metadata = {
  title: "Video lesson",
  description: "Join your private Amazing Skills video lesson.",
};

export default async function VideoSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionForParticipant(id);
  if (!session) notFound();

  const earliest = new Date(session.booking.startsAt.getTime() - 15 * 60_000);
  const latest = new Date(session.booking.endsAt.getTime() + 30 * 60_000);
  const now = new Date();
  const canStart = now >= earliest && now <= latest;

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Button
            variant="ghost"
            render={<Link href="/dashboard/classroom" />}
          >
            <ArrowLeft className="size-4" aria-hidden />
            Classroom
          </Button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-emerald-500" aria-hidden />
            Private LiveKit Cloud room
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">One-on-one video lesson</p>
            <h1 className="text-2xl font-semibold tracking-tight">
              Lesson with {session.otherPerson.name}
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarDays className="size-4" aria-hidden />
              {formatDateTime(session.booking.startsAt, session.participant.timezone)}
            </p>
          </div>
          <StatusBadge tone={statusTone(session.status)}>
            {formatStatus(session.status)}
          </StatusBadge>
        </div>

        <SessionRoom
          sessionId={session.id}
          status={session.status}
          isTeacher={session.isTeacher}
          canStart={canStart}
        />

        {session.status === "ended" &&
        !session.isTeacher &&
        !session.booking.review ? (
          <ReviewForm bookingId={session.bookingId} />
        ) : null}

        {session.booking.review ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-semibold">Your review</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {session.booking.review.rating}/5 · {session.booking.review.status}
            </p>
            <p className="mt-3 text-sm">{session.booking.review.comment}</p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
