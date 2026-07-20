"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  answerCourseQuestion,
  createCourseCoupon,
  createCourseSale,
  respondToCourseReview,
  setCoursePromotionActive,
  setCourseQuestionHidden,
} from "@/actions/course-quality";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Promotion = {
  id: string;
  name?: string;
  code?: string;
  active: boolean;
  discountType: "percent" | "fixed";
  discountValue: number;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
};

export function CourseCommerceManager({
  courseId,
  sales,
  coupons,
  questions,
  reviews,
}: {
  courseId: string;
  sales: Promotion[];
  coupons: Promotion[];
  questions: Array<{
    id: string;
    body: string;
    hidden: boolean;
    student: { name: string };
    answer: { body: string } | null;
  }>;
  reviews: Array<{
    id: string;
    rating: number;
    comment: string;
    teacherResponse: string | null;
    student: { name: string };
  }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [saleName, setSaleName] = useState("");
  const [saleType, setSaleType] = useState<"percent" | "fixed">("percent");
  const [saleValue, setSaleValue] = useState("20");
  const [saleStart, setSaleStart] = useState("");
  const [saleEnd, setSaleEnd] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponType, setCouponType] = useState<"percent" | "fixed">("percent");
  const [couponValue, setCouponValue] = useState("20");
  const [couponStart, setCouponStart] = useState("");
  const [couponEnd, setCouponEnd] = useState("");
  const [couponLimit, setCouponLimit] = useState("");

  const run = (work: () => Promise<{ success: boolean; error?: string }>, message: string) => {
    startTransition(async () => {
      const result = await work();
      if (!result.success) {
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      toast.success(message);
      window.location.reload();
    });
  };

  return (
    <div className="space-y-8">
      <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div>
          <h2 className="text-xl font-semibold">Course sales &amp; coupons</h2>
          <p className="text-sm text-muted-foreground">
            Schedule a course sale or create a course-scoped coupon. Coupons override sales.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 rounded-lg border border-border p-4">
            <h3 className="font-medium">Schedule sale</h3>
            <Input placeholder="Sale name" value={saleName} onChange={(e) => setSaleName(e.target.value)} />
            <select
              value={saleType}
              onChange={(event) => setSaleType(event.target.value as "percent" | "fixed")}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Sale discount type"
            >
              <option value="percent">Percent off</option>
              <option value="fixed">Fixed amount off (cents)</option>
            </select>
            <Input type="number" min="1" max={saleType === "percent" ? "100" : undefined} value={saleValue} onChange={(e) => setSaleValue(e.target.value)} aria-label="Sale discount value" />
            <Input type="datetime-local" value={saleStart} onChange={(e) => setSaleStart(e.target.value)} aria-label="Sale starts" />
            <Input type="datetime-local" value={saleEnd} onChange={(e) => setSaleEnd(e.target.value)} aria-label="Sale ends" />
            <Button
              disabled={isPending || !saleName || !saleStart || !saleEnd}
              onClick={() => run(
                () => createCourseSale({
                  courseId,
                  name: saleName,
                  discountType: saleType,
                  discountValue: Number(saleValue),
                  startsAt: new Date(saleStart),
                  endsAt: new Date(saleEnd),
                  active: true,
                }),
                "Sale scheduled.",
              )}
            >
              Create sale
            </Button>
          </div>
          <div className="space-y-2 rounded-lg border border-border p-4">
            <h3 className="font-medium">Create coupon</h3>
            <Input placeholder="Code" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())} />
            <select
              value={couponType}
              onChange={(event) => setCouponType(event.target.value as "percent" | "fixed")}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Coupon discount type"
            >
              <option value="percent">Percent off</option>
              <option value="fixed">Fixed amount off (cents)</option>
            </select>
            <Input type="number" min="1" max={couponType === "percent" ? "100" : undefined} value={couponValue} onChange={(e) => setCouponValue(e.target.value)} aria-label="Coupon discount value" />
            <div className="grid gap-2 sm:grid-cols-2">
              <Input type="datetime-local" value={couponStart} onChange={(e) => setCouponStart(e.target.value)} aria-label="Coupon starts" />
              <Input type="datetime-local" value={couponEnd} onChange={(e) => setCouponEnd(e.target.value)} aria-label="Coupon ends" />
            </div>
            <Input type="number" min="1" value={couponLimit} onChange={(e) => setCouponLimit(e.target.value)} placeholder="Maximum redemptions (optional)" aria-label="Coupon redemption limit" />
            <Button
              disabled={isPending || couponCode.length < 3}
              onClick={() => run(
                () => createCourseCoupon({
                  courseId,
                  name: couponCode,
                  code: couponCode,
                  discountType: couponType,
                  discountValue: Number(couponValue),
                  startsAt: couponStart ? new Date(couponStart) : undefined,
                  endsAt: couponEnd ? new Date(couponEnd) : undefined,
                  maxRedemptions: couponLimit ? Number(couponLimit) : undefined,
                  active: true,
                }),
                "Coupon created.",
              )}
            >
              Create coupon
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium">Sales</h3>
            {sales.map((sale) => (
              <div key={sale.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  {sale.name} · {sale.discountValue}{sale.discountType === "percent" ? "%" : " cents"} off · {sale.active ? "active" : "paused"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => run(
                    () => setCoursePromotionActive({ id: sale.id, kind: "sale", active: !sale.active }),
                    sale.active ? "Sale paused." : "Sale activated.",
                  )}
                >
                  {sale.active ? "Pause" : "Activate"}
                </Button>
              </div>
            ))}
          </div>
          <div>
            <h3 className="text-sm font-medium">Coupons</h3>
            {coupons.map((coupon) => (
              <div key={coupon.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">
                  {coupon.code} · {coupon.discountValue}{coupon.discountType === "percent" ? "%" : " cents"} off · {coupon.active ? "active" : "paused"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => run(
                    () => setCoursePromotionActive({ id: coupon.id, kind: "coupon", active: !coupon.active }),
                    coupon.active ? "Coupon paused." : "Coupon activated.",
                  )}
                >
                  {coupon.active ? "Pause" : "Activate"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Course Q&amp;A</h2>
        {questions.map((question) => (
          <article key={question.id} className="space-y-2 rounded-lg bg-muted/50 p-4 text-sm">
            <p className="font-medium">{question.student.name}: {question.body}</p>
            {question.answer ? <p>Answer: {question.answer.body}</p> : (
              <Textarea
                placeholder="Write an answer and press Ctrl+Enter"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                    const body = event.currentTarget.value;
                    run(() => answerCourseQuestion({ id: question.id, body }), "Answer published.");
                  }
                }}
              />
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => run(
                () => setCourseQuestionHidden({ questionId: question.id, hidden: !question.hidden }),
                question.hidden ? "Question shown." : "Question hidden.",
              )}
            >
              {question.hidden ? "Show" : "Hide"}
            </Button>
          </article>
        ))}
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Course reviews</h2>
        {reviews.map((review) => (
          <article key={review.id} className="space-y-2 rounded-lg bg-muted/50 p-4 text-sm">
            <p className="font-medium">{"★".repeat(review.rating)} · {review.student.name}</p>
            <p>{review.comment}</p>
            {review.teacherResponse ? <p>Response: {review.teacherResponse}</p> : (
              <Textarea
                placeholder="Respond and press Ctrl+Enter"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                    const body = event.currentTarget.value;
                    run(() => respondToCourseReview({ id: review.id, body }), "Response published.");
                  }
                }}
              />
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
