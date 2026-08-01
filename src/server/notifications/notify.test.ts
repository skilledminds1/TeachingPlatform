import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Captured at the db/template boundary rather than by mocking createNotification: it is
 * called from within the same module, so an export-level mock would not intercept it.
 */
const notifications: Array<{ userId: string; body: string }> = [];
const templates: Array<{ paragraphs: string[] }> = [];

const booking = {
  id: "booking-1",
  // 07:00 UTC — mid-morning in Johannesburg, still midnight in Los Angeles.
  startsAt: new Date("2026-08-10T07:00:00.000Z"),
  teacher: {
    id: "teacher-1",
    name: "Thandi",
    email: "teacher@example.com",
    timezone: "Africa/Johannesburg",
  },
  student: {
    id: "student-1",
    name: "Mia",
    email: "student@example.com",
    timezone: "America/Los_Angeles",
  },
};

vi.mock("@/lib/db", () => ({
  db: {
    booking: { findUnique: vi.fn(async () => booking) },
    notification: {
      create: vi.fn(async ({ data }: { data: { userId: string; body: string } }) => {
        notifications.push({ userId: data.userId, body: data.body });
        return { id: `notification-${notifications.length}` };
      }),
    },
  },
}));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://app.test" } }));
vi.mock("@/server/notifications/email-outbox", () => ({
  buildEmailIdempotencyKey: (...parts: unknown[]) => parts.join(":"),
  enqueueEmail: vi.fn(async () => undefined),
}));
vi.mock("@/services/email/templates", () => ({
  renderEmailTemplate: (input: { paragraphs: string[] }) => {
    templates.push({ paragraphs: input.paragraphs });
    return "<html></html>";
  },
}));

const { notifyBookingCreated } = await import("./notify");

beforeEach(() => {
  notifications.length = 0;
  templates.length = 0;
});

describe("notifyBookingCreated", () => {
  /**
   * INT-04: a single `when` string built from the TEACHER's timezone was reused in both
   * recipients' notification bodies and emails, so the student was told a time that was
   * simply wrong for them — a direct missed-lesson risk.
   */
  it("tells each recipient the lesson time in their own timezone", async () => {
    await notifyBookingCreated("booking-1");

    const teacherMessage = notifications.find((item) => item.userId === "teacher-1");
    const studentMessage = notifications.find((item) => item.userId === "student-1");

    expect(teacherMessage, "teacher was not notified").toBeDefined();
    expect(studentMessage, "student was not notified").toBeDefined();

    // 07:00 UTC is 09:00 in Johannesburg and 00:00 the same day in Los Angeles.
    expect(teacherMessage!.body).toContain("09:00");
    expect(studentMessage!.body).toContain("00:00");
    expect(teacherMessage!.body).not.toContain("00:00");
    expect(studentMessage!.body).not.toContain("09:00");
  });

  it("sends each recipient's email the same time as their notification", async () => {
    await notifyBookingCreated("booking-1");

    expect(templates).toHaveLength(2);
    const emailTimes = templates.map(
      (template) => /\d{2}:\d{2}/.exec(template.paragraphs.join(" "))?.[0],
    );
    const notificationTimes = notifications.map(
      (item) => /\d{2}:\d{2}/.exec(item.body)?.[0],
    );

    expect(emailTimes.filter(Boolean)).toHaveLength(2);
    expect([...emailTimes].sort()).toEqual([...notificationTimes].sort());
  });

  it("labels the timezone so a recipient can tell which zone is meant", async () => {
    await notifyBookingCreated("booking-1");
    for (const item of notifications) {
      expect(item.body).toMatch(/GMT|UTC|[A-Z]{2,5}/);
    }
  });
});
