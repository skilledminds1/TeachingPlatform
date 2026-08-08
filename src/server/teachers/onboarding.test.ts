import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Marketplace listing readiness.
 *
 * The regression this file exists to prevent: requiring a linked payment account before a
 * teacher may submit for approval. That was a closed loop with no exit — submission needed an
 * account, and createTeacherPaymentAccount refuses while the PayPal rail is disabled, which it
 * is by a hardcoded defect list no configuration can clear. The effect was total: no teacher
 * could ever be listed, so the marketplace could not acquire supply at all.
 *
 * Prisma and the session are mocked at the module boundary; these assert which checks gate
 * `readyToSubmit`, which is the whole contract of this function.
 */

type AnyRecord = Record<string, unknown>;

const state = {
  profile: null as AnyRecord | null,
  emailConfirmed: true,
};

vi.mock("@/lib/db", () => ({
  db: {
    teacherProfile: { findUnique: vi.fn(async () => state.profile) },
  },
}));
vi.mock("@/server/auth/session", () => ({
  requireTeacher: vi.fn(async () => ({ id: "teacher-1" })),
  getAuthUser: vi.fn(async () => ({
    email_confirmed_at: state.emailConfirmed ? "2026-08-08T00:00:00.000Z" : null,
  })),
}));

const { getTeacherProfileReadiness } = await import("./onboarding");

/** A profile that satisfies every genuine listing requirement. */
function completeProfile(overrides: AnyRecord = {}) {
  return {
    id: "profile-1",
    status: "draft",
    bio: Array.from({ length: 120 }, (_, i) => `word${i}`).join(" "),
    hourlyRateCents: 45_00,
    introVideoUrl: "https://example.com/v.mp4",
    introVideoPath: "teacher-1/v.mp4",
    subjects: [{ subjectId: "subject-1" }],
    qualifications: [{ id: "qual-1" }],
    paymentLinkUrl: null,
    user: { avatarUrl: "https://example.com/a.png" },
    organization: { plan: { name: "Starter", marketplaceListing: true } },
    ...overrides,
  };
}

beforeEach(() => {
  state.profile = completeProfile();
  state.emailConfirmed = true;
  vi.clearAllMocks();
});

describe("getTeacherProfileReadiness", () => {
  it("lets a teacher submit with NO payment account linked", async () => {
    const readiness = await getTeacherProfileReadiness();

    // The deadlock, pinned shut. If this ever fails, onboarding is closed again.
    expect(readiness.checks.paymentLinked).toBe(false);
    expect(readiness.readyToSubmit).toBe(true);
  });

  it("still reports the missing payment account so the dashboard can prompt", async () => {
    const readiness = await getTeacherProfileReadiness();

    // Removed as a GATE, kept as a SIGNAL — the prompt moves to the first booking request.
    expect(readiness.checks).toHaveProperty("paymentLinked", false);
  });

  it("reports paymentLinked once a payment link is saved", async () => {
    state.profile = completeProfile({ paymentLinkUrl: "https://buy.stripe.com/abc" });

    const readiness = await getTeacherProfileReadiness();

    expect(readiness.checks.paymentLinked).toBe(true);
    expect(readiness.readyToSubmit).toBe(true);
  });

  it("still blocks on an unverified email", async () => {
    state.emailConfirmed = false;

    const readiness = await getTeacherProfileReadiness();

    expect(readiness.readyToSubmit).toBe(false);
  });

  it("still blocks on a plan without marketplace listing", async () => {
    state.profile = completeProfile({
      organization: { plan: { name: "Free", marketplaceListing: false } },
    });

    const readiness = await getTeacherProfileReadiness();

    expect(readiness.readyToSubmit).toBe(false);
  });

  it("still blocks on a missing introduction video before approval", async () => {
    state.profile = completeProfile({ introVideoUrl: null, introVideoPath: null });

    const readiness = await getTeacherProfileReadiness();

    expect(readiness.readyToSubmit).toBe(false);
  });

  it("does not require the video from an already-approved profile", async () => {
    // Approved teachers predate the video requirement and must keep dashboard access.
    state.profile = completeProfile({
      status: "approved",
      introVideoUrl: null,
      introVideoPath: null,
    });

    const readiness = await getTeacherProfileReadiness();

    expect(readiness.readyToSubmit).toBe(true);
  });

  it("still blocks on a thin biography", async () => {
    state.profile = completeProfile({ bio: "Too short." });

    const readiness = await getTeacherProfileReadiness();

    expect(readiness.profileComplete).toBe(false);
    expect(readiness.readyToSubmit).toBe(false);
  });
});
