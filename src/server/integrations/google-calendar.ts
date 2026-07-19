import { db } from "@/lib/db";
import { env, hasGoogleCalendarEnv, requireGoogleCalendarEnv } from "@/lib/env";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars";
const SCOPES = ["https://www.googleapis.com/auth/calendar.events", "openid", "email"].join(" ");

export function googleCalendarConfigured(): boolean {
  return hasGoogleCalendarEnv();
}

export function googleCalendarRedirectUri(): string {
  return new URL("/api/integrations/google-calendar/callback", env.NEXT_PUBLIC_APP_URL).toString();
}

export function buildGoogleCalendarAuthUrl(state: string): string {
  const { clientId } = requireGoogleCalendarEnv();
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", googleCalendarRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeGoogleCalendarCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  email: string | null;
}> {
  const { clientId, clientSecret } = requireGoogleCalendarEnv();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: googleCalendarRedirectUri(),
    grant_type: "authorization_code",
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google token exchange failed: ${text}`);
  }

  const json = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  if (!json.refresh_token) {
    throw new Error("Google did not return a refresh token. Disconnect and reconnect.");
  }

  let email: string | null = null;
  const profileResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${json.access_token}` },
  });
  if (profileResponse.ok) {
    const profile = (await profileResponse.json()) as { email?: string };
    email = profile.email ?? null;
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    email,
  };
}

export async function getCalendarConnection(userId: string) {
  return db.calendarConnection.findUnique({
    where: { userId_provider: { userId, provider: "google" } },
  });
}

export async function upsertCalendarConnection(input: {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  email: string | null;
}) {
  return db.calendarConnection.upsert({
    where: { userId_provider: { userId: input.userId, provider: "google" } },
    create: {
      userId: input.userId,
      provider: "google",
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      tokenExpiresAt: input.expiresAt,
      googleEmail: input.email,
      calendarId: "primary",
    },
    update: {
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      tokenExpiresAt: input.expiresAt,
      googleEmail: input.email,
    },
  });
}

export async function deleteCalendarConnection(userId: string) {
  await db.calendarConnection.deleteMany({
    where: { userId, provider: "google" },
  });
}

async function refreshAccessToken(connectionId: string, refreshToken: string) {
  const { clientId, clientSecret } = requireGoogleCalendarEnv();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error("Failed to refresh Google Calendar token.");
  }
  const json = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  const expiresAt = new Date(Date.now() + json.expires_in * 1000);
  await db.calendarConnection.update({
    where: { id: connectionId },
    data: { accessToken: json.access_token, tokenExpiresAt: expiresAt },
  });
  return json.access_token;
}

async function getValidAccessToken(userId: string): Promise<{
  accessToken: string;
  calendarId: string;
} | null> {
  const connection = await getCalendarConnection(userId);
  if (!connection) return null;

  if (connection.tokenExpiresAt.getTime() > Date.now() + 60_000) {
    return { accessToken: connection.accessToken, calendarId: connection.calendarId };
  }

  const accessToken = await refreshAccessToken(connection.id, connection.refreshToken);
  return { accessToken, calendarId: connection.calendarId };
}

export async function createEventForBooking(input: {
  bookingId: string;
  userId: string;
}): Promise<void> {
  if (!googleCalendarConfigured()) return;

  const existing = await db.bookingCalendarEvent.findUnique({
    where: {
      bookingId_userId: { bookingId: input.bookingId, userId: input.userId },
    },
  });
  if (existing) return;

  const token = await getValidAccessToken(input.userId);
  if (!token) return;

  const booking = await db.booking.findUnique({
    where: { id: input.bookingId },
    include: {
      teacher: { select: { name: true, email: true, timezone: true } },
      student: { select: { name: true, email: true, timezone: true } },
    },
  });
  if (!booking || booking.status !== "confirmed") return;

  const isTeacher = booking.teacherId === input.userId;
  const counterpart = isTeacher ? booking.student : booking.teacher;
  const timeZone = isTeacher ? booking.teacher.timezone : booking.student.timezone;
  const summary = isTeacher
    ? `Lesson with ${booking.student.name}`
    : `Lesson with ${booking.teacher.name}`;

  const response = await fetch(
    `${GOOGLE_EVENTS_URL}/${encodeURIComponent(token.calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary,
        description: `Amazing Skills lesson\n${env.NEXT_PUBLIC_APP_URL}/dashboard/bookings/${booking.id}`,
        start: { dateTime: booking.startsAt.toISOString(), timeZone },
        end: { dateTime: booking.endsAt.toISOString(), timeZone },
        attendees: [{ email: counterpart.email }],
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create Google Calendar event: ${text}`);
  }

  const json = (await response.json()) as { id: string };
  await db.bookingCalendarEvent.create({
    data: {
      bookingId: booking.id,
      userId: input.userId,
      externalEventId: json.id,
    },
  });
}

export async function deleteEventForBooking(input: {
  bookingId: string;
  userId: string;
}): Promise<void> {
  if (!googleCalendarConfigured()) return;

  const event = await db.bookingCalendarEvent.findUnique({
    where: {
      bookingId_userId: { bookingId: input.bookingId, userId: input.userId },
    },
  });
  if (!event) return;

  const token = await getValidAccessToken(input.userId);
  if (token) {
    await fetch(
      `${GOOGLE_EVENTS_URL}/${encodeURIComponent(token.calendarId)}/events/${encodeURIComponent(event.externalEventId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token.accessToken}` },
      },
    ).catch(() => undefined);
  }

  await db.bookingCalendarEvent.delete({ where: { id: event.id } }).catch(() => undefined);
}

export async function updateEventForBooking(input: {
  bookingId: string;
  userId: string;
}): Promise<void> {
  if (!googleCalendarConfigured()) return;

  const event = await db.bookingCalendarEvent.findUnique({
    where: {
      bookingId_userId: { bookingId: input.bookingId, userId: input.userId },
    },
  });
  if (!event) {
    await createEventForBooking(input);
    return;
  }

  const token = await getValidAccessToken(input.userId);
  if (!token) return;

  const booking = await db.booking.findUnique({
    where: { id: input.bookingId },
    include: {
      teacher: { select: { name: true, email: true, timezone: true } },
      student: { select: { name: true, email: true, timezone: true } },
    },
  });
  if (!booking || booking.status !== "confirmed") return;

  const isTeacher = booking.teacherId === input.userId;
  const counterpart = isTeacher ? booking.student : booking.teacher;
  const timeZone = isTeacher ? booking.teacher.timezone : booking.student.timezone;
  const summary = isTeacher
    ? `Lesson with ${booking.student.name}`
    : `Lesson with ${booking.teacher.name}`;

  const response = await fetch(
    `${GOOGLE_EVENTS_URL}/${encodeURIComponent(token.calendarId)}/events/${encodeURIComponent(event.externalEventId)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary,
        description: `Amazing Skills lesson\n${env.NEXT_PUBLIC_APP_URL}/dashboard/bookings/${booking.id}`,
        start: { dateTime: booking.startsAt.toISOString(), timeZone },
        end: { dateTime: booking.endsAt.toISOString(), timeZone },
        attendees: [{ email: counterpart.email }],
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update Google Calendar event: ${text}`);
  }
}

export async function updateEventsForBooking(bookingId: string): Promise<void> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: { teacherId: true, studentId: true },
  });
  if (!booking) return;

  await Promise.allSettled([
    updateEventForBooking({ bookingId, userId: booking.teacherId }),
    updateEventForBooking({ bookingId, userId: booking.studentId }),
  ]);
}

export async function syncBookingToConnectedCalendars(bookingId: string): Promise<void> {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: { teacherId: true, studentId: true },
  });
  if (!booking) return;

  await Promise.allSettled([
    createEventForBooking({ bookingId, userId: booking.teacherId }),
    createEventForBooking({ bookingId, userId: booking.studentId }),
  ]);
}

export async function removeBookingFromConnectedCalendars(bookingId: string): Promise<void> {
  const events = await db.bookingCalendarEvent.findMany({
    where: { bookingId },
    select: { userId: true },
  });
  await Promise.allSettled(
    events.map((event) =>
      deleteEventForBooking({ bookingId, userId: event.userId }),
    ),
  );
}
