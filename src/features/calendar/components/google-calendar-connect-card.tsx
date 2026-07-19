"use client";

import { Link2, Link2Off } from "lucide-react";
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
}: {
  connected: boolean;
  email: string | null;
  configured: boolean;
  returnTo: string;
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
