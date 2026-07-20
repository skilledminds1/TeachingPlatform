"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { startCourseCheckout } from "@/actions/payments";
import { Button } from "@/components/ui/button";

export function CoursePurchaseButton({
  courseId,
  priceLabel,
  isFree,
  enrolledHref,
}: {
  courseId: string;
  priceLabel: string;
  isFree: boolean;
  enrolledHref?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [couponCode, setCouponCode] = useState("");

  if (enrolledHref) {
    return (
      <Button className="w-full" size="lg" render={<Link href={enrolledHref} />}>
        Go to course
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <input
        value={couponCode}
        onChange={(event) => setCouponCode(event.target.value.toUpperCase())}
        placeholder="Coupon code (optional)"
        aria-label="Coupon code"
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
      />
      <Button
      className="w-full"
      size="lg"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await startCourseCheckout({ courseId, couponCode: couponCode || undefined });
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
      {isPending
        ? isFree
          ? "Enrolling…"
          : "Starting checkout…"
        : isFree
          ? "Enroll free"
          : `Buy course · ${priceLabel}`}
      </Button>
      <p className="text-xs text-muted-foreground">
        Coupons override an active sale; discounts do not stack.
      </p>
    </div>
  );
}
