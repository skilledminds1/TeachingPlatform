# Product Backlog

Amazing Skills — online tutoring marketplace (Preply / AmazingTalker model). **Live 1:1 lessons only.**

Check off items as they are completed.

Self-paced courses were built, shipped, and then removed in full — catalogue, authoring, purchase,
enrollment, coupons, certificates, course reviews and course Q&A. They are not deferred and they are
not behind a flag; see [Why courses are out of scope](PROJECT.md#why-courses-are-out-of-scope) before
adding any of it back.

---

# Phase 1 — Foundation

- [x] Landing Page
- [x] Authentication
- [x] Roles (platform admin, org admin, instructor, student)
- [x] Database schema (core entities)

---

# Phase 2 — Dashboards

- [ ] Teacher Dashboard
- [x] Teacher onboarding (photo, profile, subjects, rate, qualifications)
- [x] Secure organization invitation links and acceptance
- [x] Student Dashboard
- [ ] Organization Admin Dashboard
- [x] Platform Admin Dashboard

---

# Phase 3 — Find Tutor

- [x] Teacher Profiles (public page: bio, subjects, qualifications, availability, rate)
- [x] Find Tutor listing page (`/find-tutor`)
- [x] Search (name, subject, keyword)
- [x] Filters (subject, price, rating) + sorting (rating, price, newest)
- [x] Reviews & ratings (approved reviews with aggregates and teacher responses)
- [x] Profile approval workflow (admin moderation; only approved profiles listed)

---

# Phase 4 — Bookings

- [x] Teacher availability (weekly schedule + blocked/extra-hour exceptions)
- [x] Calendar views (teacher & student)
- [x] Timezone handling (teacher-local schedules, UTC bookings, viewer-local display)
- [x] Booking flow (60-minute slot selection, atomic reservation, confirmation)
- [x] Cancellation policies (upcoming lesson cancellation with reason and 24-hour notice)

---

# Phase 5 — Video Sessions

- [x] LiveKit Cloud integration (private rooms and short-lived participant tokens)
- [x] Video room per confirmed booking
- [x] Join session UI (teacher & student)
- [x] Session status tracking (scheduled → live → ended; booking completed/no-show)
- [x] Post-session review prompt and moderation submission

---

# Phase 6 — Subscriptions

- [x] PayFast monthly and annual subscription checkout
- [x] Signed, server-validated, idempotent PayFast ITN webhooks
- [x] Plan entitlements and concurrency-safe new-student limits
- [x] Monthly live-lesson quotas (2 / 20 / 75 hours / unlimited fair use)
- [x] USD pricing and billing dashboard
- [x] Upgrade prompts and hosted checkout
- [x] Downgrade scheduling, explicit paid trials, cancellation, and humane grace-period automation

---

# Phase 7 — Teacher Payments

- [x] PayPal account linking (OAuth foundation; provider credentials required)
- [x] Student checkout via teacher's PayPal account
- [x] Payment confirmation webhooks (PayPal lesson payments)
- [x] Teacher earnings summary (read-only, from verified payment attempts)
- [ ] Skrill checkout (deferred)
- [ ] Wise checkout (not applicable — payouts only)

---

# Phase 8 — Communication

- [x] In-app messaging (teacher ↔ student)
- [x] Notification center
- [x] Email notifications (booking, payment, session reminder)
- [x] Reliable email outbox, delivery retries/logs, preferences, and admin visibility

---

# Phase 9 — Analytics & AI

- [ ] Instructor analytics
- [x] Platform admin reports
- [x] Platform admin analytics CSV export
- [ ] PDF export
- [ ] AI features (lesson notes, insights — optional)

---

# Future (Post-v1)

- [ ] Homework & assignments
- [ ] Quizzes
- [ ] Group classes
- [ ] Mobile apps
