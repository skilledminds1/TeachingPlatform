"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import "@/styles/globals.css";

/**
 * QLT-05: the last resort, for errors thrown by the ROOT LAYOUT itself.
 *
 * A root-layout failure means src/app/error.tsx never renders, because that boundary lives
 * inside the layout it is trying to report on. Next replaces the whole document with this
 * file, so it must supply its own html and body.
 *
 * Deliberately dependency-free beyond the stylesheet: whatever broke the layout may well be
 * a shared provider, so importing the usual component tree here risks the error screen
 * failing the same way as the page.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { area: "global", boundary: "global-error" },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Amazing Skills is unavailable</h1>
          <p className="text-sm text-muted-foreground">
            Something failed while loading the application itself. Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Reload
          </button>
          {error.digest ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Reference: <code className="font-mono">{error.digest}</code>
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
