-- Update teacher subscription prices and course allowances.
UPDATE "plans"
SET
  "monthly_price_cents" = 1200,
  "annual_price_cents" = 12000,
  "student_limit" = 5,
  "course_limit" = 0,
  "features" = array_remove(array_remove("features", 'courses'), 'unlimited_courses'),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" = 'starter';

UPDATE "plans"
SET
  "monthly_price_cents" = 2900,
  "annual_price_cents" = 29000,
  "student_limit" = 15,
  "course_limit" = 5,
  "features" = array_remove(
    CASE
      WHEN NOT ('courses' = ANY("features")) THEN array_append("features", 'courses')
      ELSE "features"
    END,
    'unlimited_courses'
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" = 'professional';

UPDATE "plans"
SET
  "monthly_price_cents" = 4900,
  "annual_price_cents" = 49000,
  "student_limit" = NULL,
  "course_limit" = 10,
  "features" = array_remove(
    CASE
      WHEN NOT ('courses' = ANY("features")) THEN array_append("features", 'courses')
      ELSE "features"
    END,
    'unlimited_courses'
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" = 'business';

UPDATE "plans"
SET
  "monthly_price_cents" = 0,
  "annual_price_cents" = 0,
  "student_limit" = 1,
  "course_limit" = 0,
  "features" = array_remove(array_remove("features", 'courses'), 'unlimited_courses'),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" = 'free';
