"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  askCourseQuestion,
  deleteCourseQuestion,
  setCourseQuestionPublic,
  submitCourseReview,
} from "@/actions/course-quality";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

export function CourseCommunity({
  courseId,
  completedLessonCount,
  review,
  questions,
  viewerId,
}: {
  courseId: string;
  viewerId: string;
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
    studentId: string;
    isPublic: boolean;
    createdAt: Date | string;
    answer: { body: string; createdAt: Date | string } | null;
  }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [question, setQuestion] = useState("");
  // QLT-10: opt IN, never opt out. Publication used to be the silent default.
  const [publishQuestion, setPublishQuestion] = useState(false);

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
          <p className="text-sm text-muted-foreground">
            Ask the teacher about course material. Your question stays private between
            you and them unless you choose to share it.
          </p>
        </div>
        <div className="space-y-3">
          <Textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask a course question"
          />
          {/*
            QLT-10: the consent itself. Unticked by default, and the copy says where the
            text goes rather than leaving a student to find out from a search engine.
          */}
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={publishQuestion}
              onCheckedChange={(checked) => setPublishQuestion(checked === true)}
              aria-label="Publish this question on the public course page"
            />
            <span className="text-muted-foreground">
              Also show this question and its answer on the public course page, where
              anyone can read it. Your name is never shown, and you can undo this later.
            </span>
          </label>
          <Button
            variant="outline"
            disabled={isPending || question.trim().length < 5}
            onClick={() =>
              run(
                () =>
                  askCourseQuestion({
                    courseId,
                    body: question,
                    isPublic: publishQuestion,
                  }),
                publishQuestion
                  ? "Question sent, and shared on the course page."
                  : "Question sent privately to your teacher.",
              )
            }
          >
            Ask question
          </Button>
        </div>
        <div className="space-y-3">
          {questions.map((item) => {
            const isMine = item.studentId === viewerId;
            return (
              <article key={item.id} className="rounded-md bg-muted/60 p-3 text-sm">
                <p className="font-medium">{item.body}</p>
                {item.answer ? (
                  <p className="mt-2 text-muted-foreground">Teacher: {item.answer.body}</p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Awaiting answer</p>
                )}
                {/*
                  QLT-10: a student can see where their own question stands and change
                  it. Without this the opt-in is a decision they can never revisit.
                */}
                {isMine ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-2 text-xs">
                    <span className="text-muted-foreground">
                      {item.isPublic ? "Shown on the public course page" : "Private"}
                    </span>
                    <button
                      type="button"
                      disabled={isPending}
                      className="font-medium underline underline-offset-2 disabled:opacity-50"
                      onClick={() =>
                        run(
                          () =>
                            setCourseQuestionPublic({
                              questionId: item.id,
                              isPublic: !item.isPublic,
                            }),
                          item.isPublic
                            ? "Question removed from the public page."
                            : "Question shared on the public page.",
                        )
                      }
                    >
                      {item.isPublic ? "Make private" : "Share publicly"}
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      className="font-medium text-destructive underline underline-offset-2 disabled:opacity-50"
                      onClick={() =>
                        run(
                          () => deleteCourseQuestion({ questionId: item.id }),
                          "Question deleted.",
                        )
                      }
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
