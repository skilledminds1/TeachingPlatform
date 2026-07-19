-- Course creation and sales are reserved for Professional and Business plans.
UPDATE "plans"
SET
  "course_limit" = 0,
  "features" = array_remove(array_remove("features", 'courses'), 'unlimited_courses'),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" IN ('free', 'starter');

UPDATE "plans"
SET
  "course_limit" = NULL,
  "features" = CASE
    WHEN NOT ('courses' = ANY("features")) THEN array_append("features", 'courses')
    ELSE "features"
  END,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" IN ('professional', 'business');

UPDATE "plans"
SET
  "features" = CASE
    WHEN NOT ('unlimited_courses' = ANY("features")) THEN array_append("features", 'unlimited_courses')
    ELSE "features"
  END,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "slug" IN ('professional', 'business');
