"use client";

import { ErrorScreen } from "@/features/errors/components/error-screen";

/**
 * QLT-05: was a bespoke copy that only console.error'd, so nothing an admin hit ever reached
 * the tracker. Now shares the screen and the capture with every other boundary.
 */
export default function AdminError({
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
      area="admin"
      title="Admin page failed to load"
      description="Something went wrong loading this admin view. Try again, or return later if the problem persists."
      fallbackHref="/admin"
      fallbackLabel="Back to admin"
    />
  );
}
