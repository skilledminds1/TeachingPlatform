-- Align the existing database index name with the Prisma schema-generated name.
ALTER INDEX "booking_reschedule_proposals_proposed_starts_at_proposed_ends_a"
RENAME TO "booking_reschedule_proposals_proposed_starts_at_proposed_en_idx";
