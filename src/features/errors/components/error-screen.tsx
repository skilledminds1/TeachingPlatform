"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

import { Button } from "@/components/ui/button";

/**
 * The branded screen every error boundary renders (QLT-05).
 *
 * Before this, only /admin and the teacher analytics page had a boundary. Anything thrown
 * during a server-component render on /find-tutor, /courses, /dashboard or checkout fell
 * through to Next's unstyled production error page — a bare digest string on exactly the
 * pages where a stranger is deciding whether to trust this platform with money.
 *
 * It is one component rather than five copies so the copy, the retry and the capture cannot
 * drift apart. Boundaries below only supply the wording that differs.
 */
export function ErrorScreen({
  error,
  reset,
  title,
  description,
  /** Where "go back" should lead, when retrying is unlikely to be what the user wants. */
  fallbackHref = "/",
  fallbackLabel = "Go to the homepage",
  /** Tags the capture so alerts can be routed by area rather than by URL. */
  area,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  title: string;
  description: string;
  fallbackHref?: string;
  fallbackLabel?: string;
  area: string;
}) {
  useEffect(() => {
    // The existing boundaries only console.error'd, so nothing an end user hit ever reached
    // the tracker — the failures least likely to be reproduced locally were the ones we
    // never heard about.
    Sentry.captureException(error, {
      tags: { area, boundary: "react-error-boundary" },
      extra: { digest: error.digest },
    });
    console.error(error);
  }, [error, area]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        {reset ? (
          <Button onClick={reset}>
            <RotateCcw className="size-4" aria-hidden />
            Try again
          </Button>
        ) : null}
        <Link
          href={fallbackHref}
          className="rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          {fallbackLabel}
        </Link>
      </div>

      {/*
        The digest is what support needs to find this exact failure in the tracker. Shown
        quietly rather than hidden: without it a user can only say "it broke".
      */}
      {error.digest ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Reference: <code className="font-mono">{error.digest}</code>
        </p>
      ) : null}
    </div>
  );
}
