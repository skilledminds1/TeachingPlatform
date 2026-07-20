import { describe, expect, it } from "vitest";

import {
  aggregateApprovedCourseReviews,
  calculateCoursePrice,
  canAccessCourseMedia,
  canAnswerCourseQuestion,
  canAskCourseQuestion,
  canReviewCourse,
} from "./quality";

describe("course reviews", () => {
  it("requires active access and meaningful progress", () => {
    expect(canReviewCourse({ enrollmentRevokedAt: null, completedLessonCount: 0 })).toEqual({
      eligible: false,
      reason: "Complete at least one lesson before reviewing this course.",
    });
    expect(canReviewCourse({ enrollmentRevokedAt: null, completedLessonCount: 1 }).eligible).toBe(
      true,
    );
    expect(
      canReviewCourse({ enrollmentRevokedAt: new Date(), completedLessonCount: 3 }).eligible,
    ).toBe(false);
  });

  it("aggregates approved reviews only", () => {
    expect(
      aggregateApprovedCourseReviews([
        { rating: 5, status: "approved" },
        { rating: 1, status: "pending" },
        { rating: 4, status: "approved" },
      ]),
    ).toEqual({ count: 2, average: 4.5 });
  });
});

describe("course preview access", () => {
  it("allows public previews but gates private lessons", () => {
    expect(
      canAccessCourseMedia({
        isPreview: true,
        isPublished: true,
        isEnrolled: false,
        isTeacher: false,
        isAdmin: false,
      }),
    ).toBe(true);
    expect(
      canAccessCourseMedia({
        isPreview: false,
        isPublished: true,
        isEnrolled: false,
        isTeacher: false,
        isAdmin: false,
      }),
    ).toBe(false);
  });
});

describe("course pricing", () => {
  it("applies a sale", () => {
    expect(calculateCoursePrice(10_000, { id: "sale", type: "percent", value: 20 }, null)).toMatchObject(
      { amountCents: 8_000, discountCents: 2_000, saleId: "sale", couponId: null },
    );
  });

  it("uses a coupon instead of stacking with a sale", () => {
    expect(
      calculateCoursePrice(
        10_000,
        { id: "sale", type: "percent", value: 20 },
        { id: "coupon", type: "fixed", value: 3_000 },
      ),
    ).toMatchObject({
      amountCents: 7_000,
      discountCents: 3_000,
      saleId: null,
      couponId: "coupon",
      discountSource: "coupon",
    });
  });

  it("clamps discounts to a zero effective price", () => {
    expect(
      calculateCoursePrice(1_000, null, { id: "free", type: "fixed", value: 2_000 }).amountCents,
    ).toBe(0);
  });
});

describe("course Q&A authorization", () => {
  it("requires an active, unrestricted enrollment to ask", () => {
    expect(
      canAskCourseQuestion({
        isEnrolled: true,
        enrollmentRevoked: false,
        isRestricted: false,
      }),
    ).toBe(true);
    expect(
      canAskCourseQuestion({
        isEnrolled: true,
        enrollmentRevoked: true,
        isRestricted: false,
      }),
    ).toBe(false);
  });

  it("allows only an unrestricted course teacher to answer", () => {
    expect(
      canAnswerCourseQuestion({ isCourseTeacher: true, isRestricted: false }),
    ).toBe(true);
    expect(
      canAnswerCourseQuestion({ isCourseTeacher: false, isRestricted: false }),
    ).toBe(false);
  });
});
