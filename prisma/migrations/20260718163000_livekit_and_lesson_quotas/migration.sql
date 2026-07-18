ALTER TABLE "plans"
ADD COLUMN "monthly_live_lesson_minutes" INTEGER,
ADD COLUMN "course_limit" INTEGER;

UPDATE "plans"
SET
  "monthly_live_lesson_minutes" = CASE "slug"
    WHEN 'free' THEN 120
    WHEN 'starter' THEN 1200
    WHEN 'professional' THEN 4500
    WHEN 'business' THEN NULL
    ELSE "monthly_live_lesson_minutes"
  END,
  "course_limit" = CASE "slug"
    WHEN 'free' THEN 1
    WHEN 'starter' THEN NULL
    WHEN 'professional' THEN NULL
    WHEN 'business' THEN NULL
    ELSE "course_limit"
  END;

ALTER TABLE "video_sessions"
RENAME COLUMN "daily_room_name" TO "livekit_room_name";

ALTER TABLE "video_sessions"
DROP COLUMN "daily_room_url";
