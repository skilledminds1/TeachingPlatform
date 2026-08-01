-- MON-29 — Database-level guarantee that a teacher cannot be double-booked.
--
-- Concurrency safety currently rests entirely on every write path remembering to use a
-- Serializable transaction with a collision check. createBooking, scheduleLessonAsTeacher
-- and acceptBookingReschedule all do; proposeBookingReschedule does not, and any future
-- path (an admin tool, an import, a forgotten isolationLevel) can silently reintroduce the
-- bug. Application checks give friendly errors; this makes the invariant true regardless.
--
-- NOTE ON TYPES: Prisma maps DateTime to TIMESTAMP(3) WITHOUT time zone, so this uses
-- `tsrange`, not `tstzrange`. Using the tz variant would force an implicit cast through the
-- session TimeZone setting and could behave differently between connections.

-- Required to combine an equality test on a uuid with a range-overlap test in one
-- exclusion constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Fail loudly and usefully if the data already violates the invariant, rather than emitting
-- a bare constraint error that says nothing about which bookings are at fault.
DO $$
DECLARE
  conflicting TEXT;
BEGIN
  SELECT string_agg(format('%s <-> %s', a.id, b.id), ', ')
  INTO conflicting
  FROM bookings a
  JOIN bookings b
    ON a.teacher_id = b.teacher_id
   AND a.id < b.id
   AND a.status IN ('pending_payment', 'confirmed')
   AND b.status IN ('pending_payment', 'confirmed')
   AND tsrange(a.starts_at, a.ends_at, '[)') && tsrange(b.starts_at, b.ends_at, '[)');

  IF conflicting IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add no-double-booking constraint: existing overlapping bookings must be resolved first (%)',
      conflicting;
  END IF;
END
$$;

-- Only live bookings reserve a slot. Cancelled, completed and no-show rows must be free to
-- overlap, otherwise rebooking the same time after a cancellation would be rejected.
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_teacher_overlap"
  EXCLUDE USING gist (
    "teacher_id" WITH =,
    tsrange("starts_at", "ends_at", '[)') WITH &&
  )
  WHERE (status IN ('pending_payment', 'confirmed'));
