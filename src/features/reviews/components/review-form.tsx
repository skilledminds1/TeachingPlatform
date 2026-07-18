"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { submitReview } from "@/actions/reviews";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function ReviewForm({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h2 className="font-semibold">How was your lesson?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your review will appear after platform moderation.
        </p>
      </div>
      <div className="flex gap-1" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            aria-label={`${value} star${value === 1 ? "" : "s"}`}
            onClick={() => setRating(value)}
            className="rounded p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Star
              className={cn(
                "size-6",
                value <= rating
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground/40",
              )}
              aria-hidden
            />
          </button>
        ))}
      </div>
      <Textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Share what helped you and what other students should know…"
        rows={4}
        maxLength={2_000}
      />
      <Button
        disabled={isPending || rating === 0 || comment.trim().length < 10}
        onClick={() =>
          startTransition(async () => {
            const result = await submitReview({ bookingId, rating, comment });
            if (!result.success) {
              toast.error(result.error);
              return;
            }
            toast.success("Review submitted for moderation.");
            router.refresh();
          })
        }
      >
        {isPending ? "Submitting…" : "Submit review"}
      </Button>
    </div>
  );
}
