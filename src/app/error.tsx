"use client";

import { ErrorScreen } from "@/features/errors/components/error-screen";

/**
 * QLT-05: the root boundary. Everything without a closer one lands here — /find-tutor,
 * /courses, the public teacher and course pages — which previously showed Next's unstyled
 * production error screen to signed-out strangers.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorScreen
      error={error}
      reset={reset}
      area="root"
      title="Something went wrong"
      description="This page did not load. It is usually temporary — try again, and if it keeps happening the reference below will help us find it."
    />
  );
}
