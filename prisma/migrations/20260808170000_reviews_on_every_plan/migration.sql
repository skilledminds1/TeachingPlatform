-- Let a Free teacher be reviewed.
--
-- The Free plan sets `marketplace_listing = true` but omitted "reviews" from its feature
-- list, and submitReview (src/actions/reviews.ts) gates on that feature. So a Free teacher
-- appeared in search, took bookings, taught lessons — and no student could ever leave them a
-- rating. The profile stayed permanently unrated.
--
-- That is backwards for a marketplace with no supply yet. The teachers who most need reviews
-- to win a first student are exactly the ones who have not paid, and a catalogue whose newest
-- listings can never accumulate ratings cannot cold-start. Reviews are also the platform's
-- own retention asset — they live here and do not travel with a teacher who leaves — so
-- withholding them from the free tier was charging for the wrong thing.
--
-- Idempotent, and it leaves any plan that already grants reviews untouched.
UPDATE "plans"
SET "features" = array_append("features", 'reviews'),
    "updated_at" = CURRENT_TIMESTAMP
WHERE NOT ('reviews' = ANY("features"));
