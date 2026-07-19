import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { sendEmail } from "@/services/email/resend";

type NotifyInput = {
  userId: string;
  type: string;
  title: string;
  body: string;
  href?: string;
  metadata?: Prisma.InputJsonValue;
  email?: { to: string; subject: string; html: string };
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
    await sendEmail(input.email).catch(() => undefined);
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
        html: `<p>${booking.student.name} reserved a lesson for <strong>${when}</strong>.</p><p><a href="${env.NEXT_PUBLIC_APP_URL}${href}">Review booking</a></p>`,
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
        html: `<p>Your lesson with <strong>${booking.teacher.name}</strong> is reserved for <strong>${when}</strong>.</p><p><a href="${env.NEXT_PUBLIC_APP_URL}${href}">View booking</a></p>`,
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
      html: `<p>Hi ${profile.user.name},</p><p>Your teacher profile has been approved and is now live on Find Tutor.</p><p><a href="${env.NEXT_PUBLIC_APP_URL}${href}">View your profile</a></p>`,
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
      html: `<p>${booking.teacher.name} confirmed your lesson for <strong>${when}</strong>.</p><p><a href="${env.NEXT_PUBLIC_APP_URL}${href}">Open lesson lobby</a></p>`,
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
  await Promise.all(
    [booking.teacher, booking.student].map((person) =>
      createNotification({
        userId: person.id,
        type: "session.reminder",
        title: "Lesson starting soon",
        body: `Your lesson starts at ${formatDateTime(booking.startsAt, person.timezone)}.`,
        href,
        metadata: { bookingId: booking.id },
        email: {
          to: person.email,
          subject: "Your Amazing Skills lesson starts soon",
          html: `<p>Your lesson starts at <strong>${formatDateTime(booking.startsAt, person.timezone)}</strong>.</p><p><a href="${env.NEXT_PUBLIC_APP_URL}${href}">Join lobby</a></p>`,
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
}) {
  await createNotification({
    userId: input.recipientId,
    type: "message.received",
    title: `Message from ${input.senderName}`,
    body: input.preview.slice(0, 140),
    href: `/dashboard/messages/${input.conversationId}`,
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
      html: `<p>${proposal.booking.teacher.name} proposed moving your lesson from <strong>${current}</strong> to <strong>${when}</strong>.</p><p><a href="${env.NEXT_PUBLIC_APP_URL}${href}">Accept or decline</a></p>`,
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
        html: `<p>${proposal.booking.student.name} accepted the new lesson time: <strong>${whenTeacher}</strong>.</p><p><a href="${env.NEXT_PUBLIC_APP_URL}${href}">View booking</a></p>`,
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
      html: `<p>${proposal.booking.student.name} declined the proposed time. The lesson remains at <strong>${current}</strong>.</p><p><a href="${env.NEXT_PUBLIC_APP_URL}${href}">View booking</a></p>`,
    },
  });
}
