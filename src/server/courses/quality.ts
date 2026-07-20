export type Discount = {
  id: string;
  type: "percent" | "fixed";
  value: number;
};

export type CoursePrice = {
  listAmountCents: number;
  amountCents: number;
  discountCents: number;
  discountSource: "sale" | "coupon" | null;
  saleId: string | null;
  couponId: string | null;
};

function discountAmount(listAmountCents: number, discount: Discount): number {
  const raw =
    discount.type === "percent"
      ? Math.round((listAmountCents * Math.min(100, discount.value)) / 100)
      : discount.value;
  return Math.min(listAmountCents, Math.max(0, raw));
}

/**
 * Coupons explicitly override sales. This keeps checkout predictable and
 * guarantees discounts are never stacked.
 */
export function calculateCoursePrice(
  listAmountCents: number,
  sale: Discount | null,
  coupon: Discount | null,
): CoursePrice {
  const list = Math.max(0, Math.trunc(listAmountCents));
  const selected = coupon ?? sale;
  const discountCents = selected ? discountAmount(list, selected) : 0;
  return {
    listAmountCents: list,
    amountCents: list - discountCents,
    discountCents,
    discountSource: coupon ? "coupon" : sale ? "sale" : null,
    saleId: !coupon && sale ? sale.id : null,
    couponId: coupon?.id ?? null,
  };
}

export function canReviewCourse(input: {
  enrollmentRevokedAt: Date | string | null;
  completedLessonCount: number;
}): { eligible: boolean; reason: string | null } {
  if (input.enrollmentRevokedAt) {
    return { eligible: false, reason: "Your course access has been revoked." };
  }
  if (input.completedLessonCount < 1) {
    return {
      eligible: false,
      reason: "Complete at least one lesson before reviewing this course.",
    };
  }
  return { eligible: true, reason: null };
}

export function aggregateApprovedCourseReviews(
  reviews: Array<{ rating: number; status: "pending" | "approved" | "rejected" }>,
): { count: number; average: number | null } {
  const approved = reviews.filter((review) => review.status === "approved");
  if (approved.length === 0) return { count: 0, average: null };
  const total = approved.reduce((sum, review) => sum + review.rating, 0);
  return { count: approved.length, average: Math.round((total / approved.length) * 10) / 10 };
}

export function canAccessCourseMedia(input: {
  isPreview: boolean;
  isPublished: boolean;
  isEnrolled: boolean;
  isTeacher: boolean;
  isAdmin: boolean;
}): boolean {
  return (
    (input.isPreview && input.isPublished) ||
    input.isEnrolled ||
    input.isTeacher ||
    input.isAdmin
  );
}

export function canAskCourseQuestion(input: {
  isEnrolled: boolean;
  enrollmentRevoked: boolean;
  isRestricted: boolean;
}): boolean {
  return input.isEnrolled && !input.enrollmentRevoked && !input.isRestricted;
}

export function canAnswerCourseQuestion(input: {
  isCourseTeacher: boolean;
  isRestricted: boolean;
}): boolean {
  return input.isCourseTeacher && !input.isRestricted;
}
