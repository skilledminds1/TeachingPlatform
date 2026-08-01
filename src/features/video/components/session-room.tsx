"use client";

import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import { ExternalLink, Play, RefreshCw, Square, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { endSession, getJoinCredentials, startSession } from "@/actions/video";
import { Button } from "@/components/ui/button";

export function SessionRoom({
  sessionId,
  status,
  isTeacher,
  canStart,
}: {
  sessionId: string;
  status: "scheduled" | "live" | "ended";
  isTeacher: boolean;
  canStart: boolean;
}) {
  const router = useRouter();
  const [credentials, setCredentials] = useState<{
    serverUrl: string;
    token: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function join(): void {
    startTransition(async () => {
      const result = await getJoinCredentials(sessionId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setCredentials(result.data);
    });
  }

  if (status === "ended") {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <Square className="mx-auto size-8 text-muted-foreground" aria-hidden />
        <h2 className="mt-3 font-semibold">Lesson ended</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The video room is closed. Lesson details remain in your booking history.
        </p>
      </div>
    );
  }

  if (credentials) {
    return (
      <div className="space-y-3">
        <div
          className="h-[70vh] min-h-[520px] overflow-hidden rounded-xl border border-border bg-black shadow-sm"
          data-lk-theme="default"
        >
          <LiveKitRoom
            token={credentials.token}
            serverUrl={credentials.serverUrl}
            connect
            audio
            video
            onDisconnected={() => setCredentials(null)}
            className="h-full"
          >
            {/*
              VideoConference renders RoomAudioRenderer internally. Mounting a second one
              attached a duplicate <audio> element to every remote track, so participants
              heard each other twice, slightly out of phase.
            */}
            <VideoConference />
          </LiveKitRoom>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Your LiveKit token is private and expires shortly after this lesson.
          </p>
          {isTeacher ? (
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => {
                // Ending is irreversible: it closes the room for both participants and
                // finalises the booking. One misclick during a paid lesson ended it with no
                // confirmation and no way back.
                if (
                  !window.confirm(
                    "End this lesson for everyone? The video room closes immediately and cannot be reopened.",
                  )
                ) {
                  return;
                }
                startTransition(async () => {
                  const result = await endSession(sessionId);
                  if (!result.success) {
                    toast.error(result.error);
                    return;
                  }
                  setCredentials(null);
                  router.refresh();
                });
              }}
            >
              <Square className="size-4" aria-hidden />
              End lesson for everyone
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setCredentials(null)}>
              Leave room
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (status === "scheduled") {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <Video className="mx-auto size-8 text-primary" aria-hidden />
        <h2 className="mt-3 font-semibold">
          {isTeacher ? "Your private room is ready" : "Waiting for the teacher"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isTeacher
            ? "You can start the lesson from 15 minutes before its scheduled time."
            : "This page will allow you to join after the teacher starts the lesson."}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          {isTeacher ? (
            <Button
              disabled={isPending || !canStart}
              onClick={() =>
                startTransition(async () => {
                  const result = await startSession(sessionId);
                  if (!result.success) {
                    toast.error(result.error);
                    return;
                  }
                  router.refresh();
                })
              }
            >
              <Play className="size-4" aria-hidden />
              {isPending ? "Starting…" : "Start lesson"}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => router.refresh()}>
              <RefreshCw className="size-4" aria-hidden />
              Check again
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center shadow-sm">
      <Video className="mx-auto size-8 text-emerald-500" aria-hidden />
      <h2 className="mt-3 font-semibold">The lesson is live</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        LiveKit will request camera and microphone access when you join.
      </p>
      <Button className="mt-5" onClick={join} disabled={isPending}>
        <ExternalLink className="size-4" aria-hidden />
        {isPending ? "Creating secure access…" : "Join video room"}
      </Button>
    </div>
  );
}
