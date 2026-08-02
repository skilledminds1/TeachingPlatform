"use client";

import { ErrorScreen } from "@/features/errors/components/error-screen";

/**
 * QLT-05: checkout. The page where an error costs the most trust and where a user most needs
 * telling that nothing was charged — silence here reads as "did my card just get taken?".
 */
export default function SubscribeError({
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
      area="checkout"
      title="Checkout could not load"
      description="You have not been charged. Try again, and if this keeps happening contact support with the reference below before attempting payment another way."
      fallbackHref="/dashboard"
      fallbackLabel="Back to dashboard"
    />
  );
}
