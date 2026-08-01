import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import type { EmailTemplateInput } from "@/services/email/templates";
import { renderEmailTemplate } from "@/services/email/templates";
import {
  buildEmailIdempotencyKey,
  enqueueEmail,
  type EmailCategory,
} from "@/server/notifications/email-outbox";

type NotifyInput = {
  userId: string;
  type: string;
  title: string;
  body: string;
  href?: string;
  metadata?: Prisma.InputJsonValue;
  email?: {
    to: string;
    subject: string;
    template: EmailTemplateInput;
    category?: EmailCategory;
    idempotencyKey?: string;
  };
};

export async function createNotification(input: NotifyInput) {
  const notification = await db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      href: input.href,
      metadata: input.metadata,
    },
  });

  if (input.email) {
    await enqueueEmail({
      userId: input.userId,
      recipient: input.email.to,
      subject: input.email.subject,
      html: renderEmailTemplate(input.email.template),
      category: input.email.category ?? "transactional",
      idempotencyKey:
        input.email.idempotencyKey ?? buildEmailIdempotencyKey("notification", notification.id),
    });
  }

  return notification;
}

export async function notifyBookingCreated(bookingId: string) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      teacher: { select: { id: true, name: true, email: true, timezone: true } },
      student: { select: { id: true, name: true, email: true, timezone: true } },
    },
  });
  if (!booking) return;

  const when = formatDateTime(booking.startsAt, booking.teacher.timezone);
  const href = `/dashboard/bookings/${booking.id}`;
  await Promise.all([
    createNotification({
      userId: booking.teacher.id,
      type: "booking.created",
      title: "New lesson request",
      body: `${booking.student.name} wants to take a lesson with you on ${when}.`,
      href,
      email: {
        to: booking.teacher.email,
        subject: `New booking from ${booking.student.name}`,
        template: {
          heading: "New lesson request",
          paragraphs: [`${booking.student.name} reserved a lesson for ${when}.`],
          action: { label: "Review booking", href: `${env.NEXT_PUBLIC_APP_URL}${href}` },
        },
      },
    }),
    createNotification({
      userId: booking.student.id,
      type: "booking.created",
      title: "Booking reserved",
      body: `Your lesson with ${booking.teacher.name} is reserved for ${when}.`,
      href,
      email: {
        to: booking.student.email,
        subject: `Lesson reserved with ${booking.teacher.name}`,
        template: {
          heading: "Booking reserved",
          paragraphs: [`Your lesson with ${booking.teacher.name} is reserved for ${when}.`],
          action: { label: "View booking", href: `${env.NEXT_PUBLIC_APP_URL}${href}` },
        },
      },
    }),
  ]);
}

export async function notifyTeacherProfileApproved(profileId: string) {
  const profile = await db.teacherProfile.findUnique({
    where: { id: profileId },
    select: {
      slug: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!profile) return;

  const href = `/find-tutor/${profile.slug}`;
  await createNotification({
    userId: profile.user.id,
    type: "teacher_profile.approved",
    title: "Your teacher profile is approved",
    body: "Your profile is now live on Find Tutor and students can contact you.",
    href,
    email: {
      to: profile.user.email,
      subject: "Your Amazing Skills profile is approved",
      template: {
        heading: "Your teacher profile is approved",
        paragraphs: [
          `Hi ${profile.user.name},`,
          "Your teacher profile has been approved and is now live on Find Tutor.",
        ],
        action: { label: "View your profile", href: `${env.NEXT_PUBLIC_APP_URL}${href}` },
      },
    },
  });
}

export async function notifyTeacherProfileRejected(profileId: string) {
  const profile = await db.teacherProfile.findUnique({
    where: { id: profileId },
    select: {
      rejectionReason: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!profile) return;
  const reason = profile.rejectionReason ?? "Please review your profile and submit it again.";
  const href = "/dashboard/teacher/profile";
  await createNotification({
    userId: profile.user.id,
    type: "teacher_profile.rejected",
    title: "Profile changes requested",
    body: reason,
    href,
    email: {
      to: profile.user.email,
      subject: "Changes requested for your Amazing Skills profile",
      idempotencyKey: buildEmailIdempotencyKey("teacher_profile.rejected", profileId, reason),
      template: {
        heading: "Profile changes requested",
        paragraphs: [`Hi ${profile.user.name},`, reason],
        action: { label: "Update profile", href: `${env.NEXT_PUBLIC_APP_URL}${href}` },
      },
    },
  });
}

export async function notifyCourseApproved(courseId: string) {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      title: true,
      slug: true,
      teacher: { select: { id: true, name: true, email: true } },
    },
  });
  if (!course) return;

  const href = `/courses/${course.slug}`;
  await createNotification({
    userId: course.teacher.id,
    type: "course.approved",
    title: "Your course is approved",
    body: `${course.title} is now published and available to students.`,
    href,
    metadata: { courseId },
    email: {
      to: course.teacher.email,
      subject: `${course.title} is now published`,
      template: {
        heading: "Your course is published",
        paragraphs: [
          `Hi ${course.teacher.name},`,
          `Your course ${course.title} has been approved and published.`,
        ],
        action: { label: "View your course", href: `${env.NEXT_PUBLIC_APP_URL}${href}` },
      },
    },
  });
}

export async function notifyCourseRejected(courseId: string) {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      title: true,
      rejectionReason: true,
      teacher: { select: { id: true, name: true, email: true } },
    },
  });
  if (!course) return;

  const href = `/dashboard/teacher/courses/${courseId}`;
  const reason = course.rejectionReason ?? "Review the course details and submit it again.";
  await createNotification({
    userId: course.teacher.id,
    type: "course.rejected",
    title: "Course changes requested",
    body: `${course.title}: ${reason}`,
    href,
    metadata: { courseId, reason },
    email: {
      to: course.teacher.email,
      subject: `Changes requested for ${course.title}`,
      template: {
        heading: "Course changes requested",
        paragraphs: [
          `Hi ${course.teacher.name},`,
          `Changes were requested for ${course.title}.`,
          reason,
        ],
        action: { label: "Edit your course", href: `${env.NEXT_PUBLIC_APP_URL}${href}` },
      },
    },
  });
}

export async function notifyBookingConfirmed(bookingId: string) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      teacher: { select: { id: true, name: true, email: true } },
      student: { select: { id: true, name: true, email: true, timezone: true } },
      videoSession: { select: { id: true } },
    },
  });
  if (!booking) return;

  const when = formatDateTime(booking.startsAt, booking.student.timezone);
  const href = booking.videoSession
    ? `/sessions/${booking.videoSession.id}`
    : `/dashboard/bookings/${booking.id}`;

  await createNotification({
    userId: booking.student.id,
    type: "booking.confirmed",
    title: "Lesson confirmed",
    body: `${booking.teacher.name} confirmed your lesson for ${when}.`,
    href,
    email: {
      to: booking.student.email,
      subject: `Lesson confirmed with ${booking.teacher.name}`,
      template: {
        heading: "Lesson confirmed",
        paragraphs: [`${booking.teacher.name} confirmed your lesson for ${when}.`],
        action: { label: "Open lesson lobby", href: `${env.NEXT_PUBLIC_APP_URL}${href}` },
      },
    },
  });
}

export async function notifySessionReminder(bookingId: string) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      teacher: { select: { id: true, name: true, email: true, timezone: true } },
      student: { select: { id: true, name: true, email: true, timezone: true } },
      videoSession: { select: { id: true } },
    },
  });
  if (!booking?.videoSession) return;

  const href = `/sessions/${booking.videoSession.id}`;
  // Key on the scheduled start, not just the booking. A reschedule rewrites startsAt on the
  // SAME row, so a bookingId-only key made the job treat the already-sent reminder as
  // covering the new time: both parties' only reminder pointed at a slot that no longer
  // existed, and no second one could ever be sent.
  const scheduledFor = booking.startsAt.toISOString();
  await Promise.all(
    [booking.teacher, booking.student].map((person) =>
      createNotification({
        userId: person.id,
        type: "session.reminder",
        title: "Lesson starting soon",
        body: `Your lesson starts at ${formatDateTime(booking.startsAt, person.timezone)}.`,
        href,
        metadata: { bookingId: booking.id, startsAt: scheduledFor },
        email: {
          to: person.email,
          subject: "Your Amazing Skills lesson starts soon",
          category: "reminders",
          idempotencyKey: buildEmailIdempotencyKey(
            "session.reminder",
            booking.id,
            person.id,
            scheduledFor,
          ),
          template: {
            heading: "Lesson starting soon",
            paragraphs: [
              `Your lesson starts at ${formatDateTime(booking.startsAt, person.timezone)}.`,
            ],
            action: { label: "Join lobby", href: `${env.NEXT_PUBLIC_APP_URL}${href}` },
          },
        },
      }),
    ),
  );
}

export async function notifyNewMessage(input: {
  recipientId: string;
  senderName: string;
  conversationId: string;
  preview: string;
  href?: string;
}) {
  const recipient = await db.user.findUnique({
    where: { id: input.recipientId },
    select: { email: true },
  });
  await createNotification({
    userId: input.recipientId,
    type: "message.received",
    title: `Message from ${input.senderName}`,
    body: input.preview.slice(0, 140),
    href: input.href ?? `/dashboard/messages/${input.conversationId}`,
    email: recipient
      ? {
          to: recipient.email,
          subject: `New message from ${input.senderName}`,
          category: "messages",
          template: {
            heading: `Message from ${input.senderName}`,
            paragraphs: [input.preview.slice(0, 300)],
            action: {
              label: "Read message",
              href: `${env.NEXT_PUBLIC_APP_URL}${input.href ?? `/dashboard/messages/${input.conversationId}`}`,
            },
          },
        }
      : undefined,
  });
}

export async function notifyRescheduleProposed(proposalId: string) {
  const proposal = await db.bookingRescheduleProposal.findUnique({
    where: { id: proposalId },
    include: {
      booking: {
        include: {
          teacher: { select: { id: true, name: true, email: true } },
          student: { select: { id: true, name: true, email: true, timezone: true } },
        },
      },
    },
  });
  if (!proposal || proposal.status !== "pending") return;

  const when = formatDateTime(proposal.proposedStartsAt, proposal.booking.student.timezone);
  const current = formatDateTime(proposal.booking.startsAt, proposal.booking.student.timezone);
  const href = `/dashboard/bookings/${proposal.booking.id}`;

  await createNotification({
    userId: proposal.booking.student.id,
    type: "booking.reschedule_proposed",
    title: "Reschedule requested",
    body: `${proposal.booking.teacher.name} proposed moving your lesson from ${current} to ${when}.`,
    href,
    metadata: {
      bookingId: proposal.booking.id,
      proposalId: proposal.id,
      proposedStartsAt: proposal.proposedStartsAt.toISOString(),
    },
    email: {
      to: proposal.booking.student.email,
      subject: `Reschedule request from ${proposal.booking.teacher.name}`,
      template: {
        heading: "Reschedule requested",
        paragraphs: [
          `${proposal.booking.teacher.name} proposed moving your lesson from ${current} to ${when}.`,
        ],
        action: { label: "Accept or decline", href: `${env.NEXT_PUBLIC_APP_URL}${href}` },
      },
    },
  });
}

export async function notifyRescheduleAccepted(proposalId: string) {
  const proposal = await db.bookingRescheduleProposal.findUnique({
    where: { id: proposalId },
    include: {
      booking: {
        include: {
          teacher: { select: { id: true, name: true, email: true, timezone: true } },
          student: { select: { id: true, name: true, email: true, timezone: true } },
        },
      },
    },
  });
  if (!proposal) return;

  const href = `/dashboard/bookings/${proposal.booking.id}`;
  const whenTeacher = formatDateTime(
    proposal.booking.startsAt,
    proposal.booking.teacher.timezone,
  );
  const whenStudent = formatDateTime(
    proposal.booking.startsAt,
    proposal.booking.student.timezone,
  );

  await Promise.all([
    createNotification({
      userId: proposal.booking.teacher.id,
      type: "booking.reschedule_accepted",
      title: "Reschedule accepted",
      body: `${proposal.booking.student.name} accepted the new lesson time: ${whenTeacher}.`,
      href,
      email: {
        to: proposal.booking.teacher.email,
        subject: `${proposal.booking.student.name} accepted your reschedule`,
        template: {
          heading: "Reschedule accepted",
          paragraphs: [
            `${proposal.booking.student.name} accepted the new lesson time: ${whenTeacher}.`,
          ],
          action: { label: "View booking", href: `${env.NEXT_PUBLIC_APP_URL}${href}` },
        },
      },
    }),
    createNotification({
      userId: proposal.booking.student.id,
      type: "booking.reschedule_accepted",
      title: "Lesson rescheduled",
      body: `Your lesson with ${proposal.booking.teacher.name} is now at ${whenStudent}.`,
      href,
    }),
  ]);
}

export async function notifyRescheduleDeclined(proposalId: string) {
  const proposal = await db.bookingRescheduleProposal.findUnique({
    where: { id: proposalId },
    include: {
      booking: {
        include: {
          teacher: { select: { id: true, name: true, email: true, timezone: true } },
          student: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!proposal) return;

  const current = formatDateTime(proposal.booking.startsAt, proposal.booking.teacher.timezone);
  const href = `/dashboard/bookings/${proposal.booking.id}`;

  await createNotification({
    userId: proposal.booking.teacher.id,
    type: "booking.reschedule_declined",
    title: "Reschedule declined",
    body: `${proposal.booking.student.name} declined the new time. The lesson remains at ${current}.`,
    href,
    email: {
      to: proposal.booking.teacher.email,
      subject: `${proposal.booking.student.name} declined your reschedule`,
      template: {
        heading: "Reschedule declined",
        paragraphs: [
          `${proposal.booking.student.name} declined the proposed time. The lesson remains at ${current}.`,
        ],
        action: { label: "View booking", href: `${env.NEXT_PUBLIC_APP_URL}${href}` },
      },
    },
  });
}

export async function notifyBookingCancelled(bookingId: string) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      teacher: { select: { id: true, name: true, email: true, timezone: true } },
      student: { select: { id: true, name: true, email: true, timezone: true } },
    },
  });
  if (!booking) return;
  const href = `/dashboard/bookings/${booking.id}`;
  await Promise.all(
    [booking.teacher, booking.student].map((person) => {
      const other = person.id === booking.teacher.id ? booking.student : booking.teacher;
      const when = formatDateTime(booking.startsAt, person.timezone);
      return createNotification({
        userId: person.id,
        type: "booking.cancelled",
        title: "Lesson cancelled",
        body: `The lesson with ${other.name} on ${when} was cancelled.`,
        href,
        metadata: { bookingId },
        email: {
          to: person.email,
          subject: `Lesson cancelled with ${other.name}`,
          idempotencyKey: buildEmailIdempotencyKey("booking.cancelled", bookingId, person.id),
          template: {
            heading: "Lesson cancelled",
            paragraphs: [
              `The lesson with ${other.name} on ${when} was cancelled.`,
              booking.cancellationReason
                ? `Reason: ${booking.cancellationReason}`
                : "No reason was provided.",
            ],
            action: { label: "View booking", href: `${env.NEXT_PUBLIC_APP_URL}${href}` },
          },
        },
      });
    }),
  );
}

export async function notifyCoursePurchased(purchaseId: string) {
  const purchase = await db.coursePurchase.findUnique({
    where: { id: purchaseId },
    include: {
      course: { select: { title: true, slug: true } },
      student: { select: { id: true, name: true, email: true } },
      teacher: { select: { id: true, name: true, email: true } },
    },
  });
  if (!purchase || purchase.status !== "succeeded") return;
  const recipients = [
    {
      person: purchase.student,
      title: "Course purchase confirmed",
      body: `You now have access to ${purchase.course.title}.`,
      href: `/dashboard/courses/${purchase.courseId}`,
    },
    {
      person: purchase.teacher,
      title: "New course sale",
      body: `${purchase.student.name} purchased ${purchase.course.title}.`,
      href: "/dashboard/teacher/courses",
    },
  ];
  await Promise.all(
    recipients.map(({ person, title, body, href }) =>
      createNotification({
        userId: person.id,
        type: "course.purchased",
        title,
        body,
        href,
        metadata: { purchaseId, courseId: purchase.courseId },
        email: {
          to: person.email,
          subject: title,
          category: "payment",
          idempotencyKey: buildEmailIdempotencyKey("course.purchased", purchaseId, person.id),
          template: {
            heading: title,
            paragraphs: [body],
            action: { label: "View details", href: `${env.NEXT_PUBLIC_APP_URL}${href}` },
          },
        },
      }),
    ),
  );
}

export async function notifyRefundUpdated(refundRequestId: string) {
  const request = await db.refundRequest.findUnique({
    where: { id: refundRequestId },
    include: {
      student: { select: { id: true, name: true, email: true } },
      teacher: { select: { id: true, name: true, email: true } },
    },
  });
  if (!request) return;
  const requested = request.status === "requested";
  const recipient = requested ? request.teacher : request.student;
  const title = requested ? "New refund request" : "Refund request updated";
  const body = requested
    ? `${request.student.name} requested a refund of ${request.currency} ${(request.requestedAmountCents / 100).toFixed(2)}.`
    : `Your refund request is now ${request.status.replaceAll("_", " ")}.`;
  const href = requested ? "/dashboard/teacher/refunds" : "/dashboard/refunds";
  await createNotification({
    userId: recipient.id,
    type: `refund.${request.status}`,
    title,
    body,
    href,
    metadata: { refundRequestId },
    email: {
      to: recipient.email,
      subject: title,
      category: "payment",
      idempotencyKey: buildEmailIdempotencyKey("refund", refundRequestId, request.status),
      template: {
        heading: title,
        paragraphs: [body, request.teacherResponse ?? request.reason],
        action: { label: "View refund", href: `${env.NEXT_PUBLIC_APP_URL}${href}` },
      },
    },
  });
}

export async function notifyPaymentFailed(paymentAttemptId: string) {
  const attempt = await db.paymentAttempt.findUnique({
    where: { id: paymentAttemptId },
    include: {
      booking: {
        include: {
          student: { select: { id: true, email: true } },
          teacher: { select: { id: true, email: true } },
        },
      },
      coursePurchase: {
        include: {
          student: { select: { id: true, email: true } },
          teacher: { select: { id: true, email: true } },
        },
      },
    },
  });
  if (!attempt) return;
  const people = attempt.booking
    ? [attempt.booking.student, attempt.booking.teacher]
    : attempt.coursePurchase
      ? [attempt.coursePurchase.student, attempt.coursePurchase.teacher]
      : [];
  await Promise.all(
    people.map((person) =>
      createNotification({
        userId: person.id,
        type: "payment.failed",
        title: "Payment failed",
        body: "A payment could not be completed. No successful charge was recorded.",
        href: "/dashboard",
        metadata: { paymentAttemptId },
        email: {
          to: person.email,
          subject: "Amazing Skills payment failed",
          category: "payment",
          idempotencyKey: buildEmailIdempotencyKey("payment.failed", paymentAttemptId, person.id),
          template: {
            heading: "Payment failed",
            paragraphs: [
              "A payment could not be completed. No successful charge was recorded.",
              attempt.failureMessage ?? "Please review the payment details and try again.",
            ],
            action: { label: "Open dashboard", href: `${env.NEXT_PUBLIC_APP_URL}/dashboard` },
          },
        },
      }),
    ),
  );
}

export async function notifyPaymentDispute(
  paymentAttemptId: string,
  providerCaseId: string,
  eventId: string,
) {
  const attempt = await db.paymentAttempt.findUnique({
    where: { id: paymentAttemptId },
    include: {
      booking: {
        include: {
          student: { select: { id: true, email: true } },
          teacher: { select: { id: true, email: true } },
        },
      },
      coursePurchase: {
        include: {
          student: { select: { id: true, email: true } },
          teacher: { select: { id: true, email: true } },
        },
      },
    },
  });
  if (!attempt) return;
  const people = attempt.booking
    ? [attempt.booking.student, attempt.booking.teacher]
    : attempt.coursePurchase
      ? [attempt.coursePurchase.student, attempt.coursePurchase.teacher]
      : [];
  await Promise.all(
    people.map((person) =>
      createNotification({
        userId: person.id,
        type: "payment.dispute",
        title: "Payment dispute updated",
        body: "A payment dispute requires attention. Platform support may contact you.",
        href: "/dashboard/refunds",
        metadata: { paymentAttemptId, providerCaseId },
        email: {
          to: person.email,
          subject: "Payment dispute update",
          category: "payment",
          idempotencyKey: buildEmailIdempotencyKey(
            "payment.dispute",
            providerCaseId,
            eventId,
            person.id,
          ),
          template: {
            heading: "Payment dispute updated",
            paragraphs: [
              "A payment dispute requires attention. Platform support may contact you.",
            ],
            action: {
              label: "View payment activity",
              href: `${env.NEXT_PUBLIC_APP_URL}/dashboard/refunds`,
            },
          },
        },
      }),
    ),
  );
}

export async function notifyModerationCaseUpdated(caseId: string, eventId: string) {
  const moderationCase = await db.moderationCase.findUnique({
    where: { id: caseId },
    include: {
      reporter: { select: { id: true, email: true } },
      subject: { select: { id: true, email: true } },
    },
  });
  if (!moderationCase) return;
  const participants = [moderationCase.reporter, moderationCase.subject].filter(
    (person): person is NonNullable<typeof person> => Boolean(person),
  );
  await Promise.all(
    participants.map((person) =>
      createNotification({
        userId: person.id,
        type: "mediation.updated",
        title: "Mediation case updated",
        body: `${moderationCase.title} is now ${moderationCase.status.replaceAll("_", " ")}.`,
        href: `/dashboard/cases/${caseId}`,
        metadata: { caseId, eventId },
        email: {
          to: person.email,
          subject: "Your mediation case was updated",
          category: "admin_mediation",
          idempotencyKey: buildEmailIdempotencyKey("mediation", caseId, eventId, person.id),
          template: {
            heading: "Mediation case updated",
            paragraphs: [
              `${moderationCase.title} is now ${moderationCase.status.replaceAll("_", " ")}.`,
            ],
            action: {
              label: "View case",
              href: `${env.NEXT_PUBLIC_APP_URL}/dashboard/cases/${caseId}`,
            },
          },
        },
      }),
    ),
  );
}

export async function notifySafetyReportUpdated(reportId: string) {
  const report = await db.safetyReport.findUnique({
    where: { id: reportId },
    include: { reporter: { select: { id: true, email: true } } },
  });
  if (!report) return;
  const status = report.status.replaceAll("_", " ");
  await createNotification({
    userId: report.reporter.id,
    type: "moderation.safety_report_updated",
    title: "Safety report updated",
    body: `Your safety report is now ${status}.`,
    href: "/dashboard/safety",
    metadata: { reportId, status: report.status },
    email: {
      to: report.reporter.email,
      subject: "Your safety report was updated",
      category: "admin_mediation",
      idempotencyKey: buildEmailIdempotencyKey(
        "safety_report",
        reportId,
        report.status,
      ),
      template: {
        heading: "Safety report updated",
        paragraphs: [
          `Your safety report is now ${status}.`,
          report.resolution ?? "We will share further information when it is available.",
        ],
        action: {
          label: "View safety center",
          href: `${env.NEXT_PUBLIC_APP_URL}/dashboard/safety`,
        },
      },
    },
  });
}
