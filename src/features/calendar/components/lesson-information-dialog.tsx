"use client";

import { Check, UserRound, Wallet } from "lucide-react";
import { DateTime } from "luxon";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { proposeBookingReschedule } from "@/actions/bookings";
import { startConversationWithStudent } from "@/actions/messaging";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { formatStatus } from "@/lib/format";
import type { CalendarBooking } from "@/server/bookings/calendar";

const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? "00" : "30";
  return `${String(hour).padStart(2, "0")}:${minute}`;
});

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function LessonInformationDialog({
  open,
  onOpenChange,
  booking,
  timeZone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: CalendarBooking | null;
  timeZone: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"info" | "reschedule">("info");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");

  if (!booking) return null;

  const start = DateTime.fromISO(booking.startsAt, { zone: timeZone });
  const end = DateTime.fromISO(booking.endsAt, { zone: timeZone });
  const canReschedule =
    booking.status === "confirmed" && start > DateTime.now().setZone(timeZone);
  const today = DateTime.now().setZone(timeZone).toISODate()!;

  function openReschedule(): void {
    setDate(start.toISODate()!);
    setTime(start.toFormat("HH:mm"));
    setMode("reschedule");
  }

  function messageStudent(): void {
    startTransition(async () => {
      const result = await startConversationWithStudent(booking!.studentId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      onOpenChange(false);
      router.push(`/dashboard/messages/${result.data.conversationId}`);
    });
  }

  function submitReschedule(): void {
    const startsAt = DateTime.fromISO(`${date}T${time}`, { zone: timeZone });
    if (!startsAt.isValid) {
      toast.error("Choose a valid date and time.");
      return;
    }
    startTransition(async () => {
      const result = await proposeBookingReschedule({
        bookingId: booking!.id,
        startsAt: startsAt.toUTC().toISO()!,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Reschedule proposed. Waiting for the student to accept.");
      setMode("info");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setMode("info");
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogHeader>
          <DialogTitle>
            {mode === "info" ? "Lesson information" : "Reschedule lesson"}
          </DialogTitle>
        </DialogHeader>

        {mode === "info" ? (
          <div className="space-y-5 px-5 py-5">
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="flex items-center gap-3 px-4 py-4">
                <Avatar className="size-12 rounded-lg">
                  {booking.studentAvatarUrl ? (
                    <AvatarImage src={booking.studentAvatarUrl} alt={booking.studentName} />
                  ) : null}
                  <AvatarFallback className="rounded-lg">
                    {initials(booking.studentName) || <UserRound className="size-4" />}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{start.toFormat("cccc, LLL d")}</p>
                  <p className="text-sm text-muted-foreground">
                    {start.toFormat("HH:mm")} – {end.toFormat("HH:mm")}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-4 py-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <UserRound className="size-3.5" aria-hidden />
                  {booking.studentName}
                </span>
                <span aria-hidden>|</span>
                <span>{formatStatus(booking.status)}</span>
                <span aria-hidden>|</span>
                <span className="inline-flex items-center gap-1.5">
                  <Wallet className="size-3.5" aria-hidden />
                  {booking.completedLessons} lesson
                  {booking.completedLessons === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            {booking.status === "confirmed" ? (
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                Confirmed
              </div>
            ) : booking.status === "pending_teacher_confirmation" ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Awaiting payment confirmation
              </p>
            ) : null}

            {booking.pendingProposal ? (
              <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                Awaiting student approval for{" "}
                {DateTime.fromISO(booking.pendingProposal.proposedStartsAt, {
                  zone: timeZone,
                }).toFormat("ccc, LLL d · HH:mm")}
                .
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4 px-5 py-5">
            <p className="text-sm text-muted-foreground">
              Propose a new time. The student must accept before the lesson moves. Payment stays
              attached.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Select value={date} onChange={(event) => setDate(event.target.value)}>
                {Array.from({ length: 60 }, (_, index) => {
                  const value = DateTime.fromISO(today).plus({ days: index });
                  return (
                    <option key={value.toISODate()} value={value.toISODate()!}>
                      {value.toFormat("ccc, LLL d")}
                    </option>
                  );
                })}
              </Select>
              <Select value={time} onChange={(event) => setTime(event.target.value)}>
                {TIME_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {mode === "info" ? (
            <>
              <Button
                type="button"
                size="lg"
                className="w-full"
                disabled={isPending}
                onClick={messageStudent}
              >
                {isPending ? "Opening…" : "Message"}
              </Button>
              {canReschedule ? (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full"
                  onClick={openReschedule}
                >
                  Reschedule lesson
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                render={<Link href={`/dashboard/bookings/${booking.id}`} />}
              >
                View booking
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                size="lg"
                className="w-full"
                disabled={isPending}
                onClick={submitReschedule}
              >
                {isPending ? "Sending…" : "Propose new time"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => setMode("info")}
              >
                Back
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
