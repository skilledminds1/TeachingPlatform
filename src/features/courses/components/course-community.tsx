"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { askCourseQuestion, submitCourseReview } from "@/actions/course-quality";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function CourseCommunity({
  courseId,
  completedLessonCount,
  review,
  questions,
}: {
  courseId: string;
  completedLessonCount: number;
  review: {
    id: string;
    rating: number;
    comment: string;
    status: string;
    teacherResponse: string | null;
  } | null;
  questions: Array<{
    id: string;
    body: string;
    createdAt: Date | string;
    answer: { body: string; createdAt: Date | string } | null;
  }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [question, setQuestion] = useState("");

  const run = (work: () => Promise<{ success: boolean; error?: string }>, success: string) => {
    startTransition(async () => {
      const result = await work();
      if (!result.success) {
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      toast.success(success);
      window.location.reload();
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold">Your course review</h2>
          <p className="text-sm text-muted-foreground">
            Complete at least one lesson to submit a rating. Reviews are public after moderation.
          </p>
        </div>
        {review ? (
          <div className="space-y-2 text-sm">
            <p className="font-medium">{review.rating}/5 · {review.status}</p>
            <p>{review.comment}</p>
            {review.teacherResponse ? (
              <p className="rounded-md bg-muted p-3">Teacher: {review.teacherResponse}</p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <select
              value={rating}
              onChange={(event) => setRating(Number(event.target.value))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Course rating"
            >
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={value}>{value} stars</option>
              ))}
            </select>
            <Textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="What was useful about this course?"
            />
            <Button
              disabled={isPending || completedLessonCount < 1 || comment.trim().length < 10}
              onClick={() =>
                run(
                  () => submitCourseReview({ courseId, rating, comment }),
                  "Review submitted for moderation.",
                )
              }
            >
              Submit review
            </Button>
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold">Course Q&amp;A</h2>
          <p className="text-sm text-muted-foreground">Ask the teacher about course material.</p>
        </div>
        <div className="space-y-2">
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask a course question"
          />
          <Button
            variant="outline"
            disabled={isPending || question.trim().length < 5}
            onClick={() =>
              run(
                () => askCourseQuestion({ courseId, body: question }),
                "Question sent to your teacher.",
              )
            }
          >
            Ask question
          </Button>
        </div>
        <div className="space-y-3">
          {questions.map((item) => (
            <article key={item.id} className="rounded-md bg-muted/60 p-3 text-sm">
              <p className="font-medium">{item.body}</p>
              {item.answer ? (
                <p className="mt-2 text-muted-foreground">Teacher: {item.answer.body}</p>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Awaiting answer</p>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
