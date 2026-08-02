"use client";

import { ErrorScreen } from "@/features/errors/components/error-screen";

/**
 * QLT-05: was a bespoke copy that only console.error'd. Now shares the screen and the
 * capture with every other boundary.
 */
export default function TeacherAnalyticsError({
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
      area="teacher-analytics"
      title="Analytics failed to load"
      description="Something went wrong loading your analytics. Your earnings and bookings data are unaffected."
      fallbackHref="/dashboard/teacher"
      fallbackLabel="Back to dashboard"
    />
  );
}
