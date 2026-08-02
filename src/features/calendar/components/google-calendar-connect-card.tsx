"use client";

import { Link2, Link2Off, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { disconnectGoogleCalendar } from "@/actions/google-calendar";
import { Button } from "@/components/ui/button";

export function GoogleCalendarConnectCard({
  connected,
  email,
  configured,
  returnTo,
  needsReconnect = false,
}: {
  connected: boolean;
  email: string | null;
  configured: boolean;
  returnTo: string;
  /** QLT-09: the last token refresh failed, so nothing is syncing. */
  needsReconnect?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function disconnect(): void {
    startTransition(async () => {
      const result = await disconnectGoogleCalendar();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Google Calendar disconnected.");
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="font-semibold">Google Calendar</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sync confirmed lessons to your Google Calendar automatically.
      </p>
      {/*
        QLT-09: a refresh token can be revoked from the Google account page at any time,
        without the user coming anywhere near this platform. Before this the only symptom
        was lessons quietly not appearing on the calendar — which is exactly how a teacher
        ends up double-booked against a lesson their calendar never knew about.
      */}
      {connected && needsReconnect ? (
        <div className="mt-4 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
          <div className="flex gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
            <div>
              <p className="text-sm font-medium">Reconnect Google Calendar</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Access was revoked or expired, so lessons have stopped syncing. Reconnecting
                takes a moment and restores it.
              </p>
              <a
                className="mt-2 inline-block rounded-lg border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
                href={`/api/integrations/google-calendar/connect?returnTo=${encodeURIComponent(returnTo)}`}
              >
                Reconnect
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {connected ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">{email ?? "Connected"}</p>
          <Button variant="outline" size="sm" disabled={isPending} onClick={disconnect}>
            <Link2Off className="size-3.5" aria-hidden />
            Disconnect
          </Button>
        </div>
      ) : configured ? (
        <Button
          className="mt-4"
          variant="outline"
          render={
            // GLO-03: Button clones this anchor with its own children, so the rendered
            // element has text. The rule reads the JSX node, which is legitimately empty.
            // eslint-disable-next-line jsx-a11y/anchor-has-content
            <a
              href={`/api/integrations/google-calendar/connect?returnTo=${encodeURIComponent(returnTo)}`}
            />
          }
        >
          <Link2 className="size-3.5" aria-hidden />
          Connect Google Calendar
        </Button>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          Google Calendar linking is not configured on this server yet.
        </p>
      )}
    </div>
  );
}
