ALTER TABLE "course_sales"
  ADD CONSTRAINT "course_sales_percent_discount_check" CHECK (
    "discount_type" <> 'percent' OR "discount_value" <= 100
  );

ALTER TABLE "course_coupons"
  ADD CONSTRAINT "course_coupons_percent_discount_check" CHECK (
    "discount_type" <> 'percent' OR "discount_value" <= 100
  ),
  ADD CONSTRAINT "course_coupons_dates_check" CHECK (
    "starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" > "starts_at"
  );

ALTER TABLE "course_purchases"
  ADD CONSTRAINT "course_purchases_price_snapshot_check" CHECK (
    "list_amount_cents" >= 0
    AND "discount_cents" >= 0
    AND "discount_cents" <= "list_amount_cents"
    AND "amount_cents" = "list_amount_cents" - "discount_cents"
  ),
  ADD CONSTRAINT "course_purchases_no_discount_stacking_check" CHECK (
    NOT ("course_sale_id" IS NOT NULL AND "course_coupon_id" IS NOT NULL)
  );
