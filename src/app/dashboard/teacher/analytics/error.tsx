"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function TeacherAnalyticsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Analytics failed to load</h1>
      <p className="text-sm text-muted-foreground">
        Something went wrong while loading your analytics. Try again, or check back shortly if
        the problem persists.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
