-- QLT-09 — Surface a broken Google Calendar connection instead of syncing nothing quietly.
--
-- refreshAccessToken threw on failure and every sync call site is fire-and-forget, so a
-- revoked refresh token — which a teacher can cause at any time from their Google account
-- page, without ever visiting this platform — produced exactly one symptom: lessons stopped
-- appearing on their calendar. No error, no prompt, nothing to notice until a teacher
-- double-books themselves against a lesson the calendar never knew about.
--
-- The flag is set when a refresh fails and cleared when one succeeds, so it tracks the
-- current state rather than accumulating a history of transient failures.

ALTER TABLE "calendar_connections"
  ADD COLUMN "needs_reconnect" BOOLEAN NOT NULL DEFAULT false;
