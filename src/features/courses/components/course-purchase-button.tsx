"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { startCourseCheckout } from "@/actions/payments";
import { Button } from "@/components/ui/button";

export function CoursePurchaseButton({
  courseId,
  priceLabel,
  enrolledHref,
}: {
  courseId: string;
  priceLabel: string;
  enrolledHref?: string | null;
}) {
  const [isPending, startTransition] = useTransition();

  if (enrolledHref) {
    return (
      <Button className="w-full" size="lg" render={<Link href={enrolledHref} />}>
        Go to course
      </Button>
    );
  }

  return (
    <Button
      className="w-full"
      size="lg"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await startCourseCheckout({ courseId });
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          if (result.data.method === "redirect") {
            window.location.href = result.data.url;
            return;
          }
          toast.success("Checkout started.");
        });
      }}
    >
      {isPending ? "Starting checkout…" : `Buy course · ${priceLabel}`}
    </Button>
  );
}
