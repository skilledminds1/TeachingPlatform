import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

export function RatingStars({
  average,
  count,
  showCount = true,
}: {
  average: number;
  count: number;
  showCount?: boolean;
}) {
  if (count === 0) {
    return <span className="text-xs text-muted-foreground">No reviews yet</span>;
  }

  return (
    <span className="flex items-center gap-1.5">
      <span className="flex" aria-label={`Rated ${average.toFixed(1)} out of 5`}>
        {[1, 2, 3, 4, 5].map((position) => (
          <Star
            key={position}
            className={cn(
              "size-3.5",
              position <= Math.round(average)
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground/40",
            )}
            aria-hidden
          />
        ))}
      </span>
      <span className="text-xs font-medium">{average.toFixed(1)}</span>
      {showCount ? (
        <span className="text-xs text-muted-foreground">
          ({count} review{count === 1 ? "" : "s"})
        </span>
      ) : null}
    </span>
  );
}
