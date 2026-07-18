import { MessageSquareText, Star } from "lucide-react";

import { AdminPageHeader } from "@/features/admin/components/admin-page-header";
import { EmptyState } from "@/features/admin/components/empty-state";
import { ReviewModerationActions } from "@/features/admin/components/review-moderation-actions";
import { StatusBadge, statusTone } from "@/features/admin/components/status-badge";
import { formatDate, formatStatus } from "@/lib/format";
import { getReviewModerationQueue } from "@/server/admin/dashboard";

export default async function AdminReviewsPage() {
  const reviews = await getReviewModerationQueue();
  const pendingCount = reviews.filter((review) => review.status === "pending").length;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <AdminPageHeader
        title="Review moderation"
        description={`${pendingCount} review${pendingCount === 1 ? "" : "s"} waiting for moderation`}
      />

      {reviews.length === 0 ? (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <EmptyState
            icon={MessageSquareText}
            title="No reviews yet"
            description="Student reviews will appear here after completed bookings."
          />
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <article
              key={review.id}
              className="rounded-xl border border-border bg-card p-5 shadow-sm md:p-6"
            >
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex gap-0.5" aria-label={`${review.rating} out of 5 stars`}>
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star
                          key={index}
                          className={
                            index < review.rating
                              ? "size-4 fill-amber-500 text-amber-500"
                              : "size-4 text-muted"
                          }
                          aria-hidden
                        />
                      ))}
                    </div>
                    <StatusBadge tone={statusTone(review.status)}>
                      {formatStatus(review.status)}
                    </StatusBadge>
                  </div>

                  <blockquote className="max-w-3xl text-sm leading-relaxed">
                    &ldquo;{review.comment}&rdquo;
                  </blockquote>

                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
                    <span>
                      Student: <strong className="text-foreground">{review.student.name}</strong>
                    </span>
                    <span>
                      Teacher: <strong className="text-foreground">{review.teacher.name}</strong>
                    </span>
                    <span>Lesson: {formatDate(review.booking.startsAt)}</span>
                    <span>Submitted: {formatDate(review.createdAt)}</span>
                  </div>
                </div>

                <ReviewModerationActions
                  reviewId={review.id}
                  currentStatus={review.status}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
