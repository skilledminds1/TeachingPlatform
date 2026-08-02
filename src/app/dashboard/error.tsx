"use client";

import { ErrorScreen } from "@/features/errors/components/error-screen";

/**
 * QLT-05: the dashboard segment, where a signed-in user has work in progress. Retrying here
 * is far more likely to be what they want than being sent to the homepage, so the fallback
 * link points back into the dashboard.
 */
export default function DashboardError({
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
      area="dashboard"
      title="This page did not load"
      description="Your account and your bookings are unaffected — only this view failed to load."
      fallbackHref="/dashboard"
      fallbackLabel="Back to dashboard"
    />
  );
}
