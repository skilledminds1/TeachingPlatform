import { db } from "@/lib/db";
import { logger } from "@/lib/observability/logger";
import { env, hasGoogleCalendarEnv, requireGoogleCalendarEnv } from "@/lib/env";
import { decryptSecret, encryptSecret, hasSecretBoxKey } from "@/lib/security/secret-box";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars";
const SCOPES = ["https://www.googleapis.com/auth/calendar.events", "openid", "email"].join(" ");

// SEC-11: refresh tokens are durable credentials for a teacher's personal calendar, so
// the integration stays disabled unless they can be encrypted at rest. Failing closed here
// is better than silently storing them in plaintext.
export function googleCalendarConfigured(): boolean {
  return hasGoogleCalendarEnv() && hasSecretBoxKey();
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
      accessToken: encryptSecret(input.accessToken),
      refreshToken: encryptSecret(input.refreshToken),
      tokenExpiresAt: input.expiresAt,
      googleEmail: input.email,
      calendarId: "primary",
    },
    update: {
      accessToken: encryptSecret(input.accessToken),
      refreshToken: encryptSecret(input.refreshToken),
      tokenExpiresAt: input.expiresAt,
      googleEmail: input.email,
    },
  });
}

export async function deleteCalendarConnection(userId: string) {
  // SEC-11: deleting the row alone left the grant live at Google indefinitely — the teacher
  // believes they disconnected, but the refresh token keeps working for anyone holding a
  // copy (a backup, a dump, a leaked replica). Revoke first, then delete regardless: a
  // failed revocation must not block the user from disconnecting.
  const connection = await getCalendarConnection(userId);
  if (connection) {
    try {
      await fetch(GOOGLE_REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: decryptSecret(connection.refreshToken) }),
        cache: "no-store",
      });
    } catch (error) {
      logger.warn("google_calendar_revoke_failed", { userId, error });
    }
  }

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
    // QLT-09: a refresh token can be revoked from the Google account page at any time,
    // without the teacher ever visiting this platform. Every sync call site is
    // fire-and-forget, so before this the only symptom was lessons quietly not appearing.
    // Record it so the UI can ask for a reconnect.
    await db.calendarConnection
      .update({ where: { id: connectionId }, data: { needsReconnect: true } })
      .catch(() => undefined);
    logger.warn("google_calendar_refresh_failed", { connectionId });
    throw new Error("Failed to refresh Google Calendar token.");
  }
  const json = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  const expiresAt = new Date(Date.now() + json.expires_in * 1000);
  await db.calendarConnection.update({
    where: { id: connectionId },
    data: {
      accessToken: encryptSecret(json.access_token),
      tokenExpiresAt: expiresAt,
      // Cleared on success, so the flag tracks the current state rather than accumulating
      // a history of transient failures.
      needsReconnect: false,
    },
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
    return {
      accessToken: decryptSecret(connection.accessToken),
      calendarId: connection.calendarId,
    };
  }

  // Legacy rows are still plaintext; decryptSecret passes those through unchanged, and the
  // refresh below rewrites the access token encrypted.
  const accessToken = await refreshAccessToken(
    connection.id,
    decryptSecret(connection.refreshToken),
  );
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
      // QLT-09: the email is deliberately NOT selected. It was only ever read to put in a
      // Google attendee list, and a field that is never fetched cannot be leaked back in by
      // the next edit to this file.
      teacher: { select: { name: true, timezone: true } },
      student: { select: { name: true, timezone: true } },
    },
  });
  if (!booking || booking.status !== "confirmed") return;

  const isTeacher = booking.teacherId === input.userId;
  const counterpart = isTeacher ? booking.student : booking.teacher;
  const timeZone = isTeacher ? booking.teacher.timezone : booking.student.timezone;
  // QLT-09: the name, which is what the calendar owner needs to see, and which was already
  // here. Only the email address went away.
  const summary = `Lesson with ${counterpart.name}`;

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
        // QLT-09: NO attendees. This used to be `[{ email: counterpart.email }]`, which
        // wrote the student's email address into the teacher's Google Calendar and the
        // teacher's into the student's — a personal-data disclosure to a third-party
        // processor that nobody consented to, and one that also made Google send an
        // invitation from the calendar owner's own address.
        //
        // Nothing is lost: the summary already names the counterparty, which is what the
        // calendar owner actually needs to see. Attendee sync could be reinstated behind a
        // two-sided opt-in, but that is machinery for a feature nobody asked for.
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
  if (!token) {
    // No usable token — keep the row. It carries the only copy of the external event id,
    // and without it the cancelled lesson stays on the calendar as busy time forever with
    // nothing left to clean it up.
    logger.warn("google_calendar_delete_skipped_no_token", { bookingId: input.bookingId });
    return;
  }

  let removed = false;
  try {
    const response = await fetch(
      `${GOOGLE_EVENTS_URL}/${encodeURIComponent(token.calendarId)}/events/${encodeURIComponent(event.externalEventId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token.accessToken}` },
      },
    );
    // 404 and 410 mean the event is already gone, which is the outcome we wanted.
    removed = response.ok || response.status === 404 || response.status === 410;
    if (!removed) {
      logger.warn("google_calendar_delete_failed", {
        bookingId: input.bookingId,
        status: response.status,
      });
    }
  } catch (error) {
    logger.warn("google_calendar_delete_error", {
      bookingId: input.bookingId,
      error: String(error),
    });
  }

  // QLT-09: ONLY drop the local row once the remote is actually gone. Deleting it
  // regardless — which is what this used to do — discarded the external event id on
  // failure, so a cancelled lesson lingered permanently on the teacher's calendar as busy
  // time and nothing could ever remove it. Retaining the row keeps a retry possible.
  if (removed) {
    await db.bookingCalendarEvent.delete({ where: { id: event.id } }).catch(() => undefined);
  }
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
      // QLT-09: the email is deliberately NOT selected. It was only ever read to put in a
      // Google attendee list, and a field that is never fetched cannot be leaked back in by
      // the next edit to this file.
      teacher: { select: { name: true, timezone: true } },
      student: { select: { name: true, timezone: true } },
    },
  });
  if (!booking || booking.status !== "confirmed") return;

  const isTeacher = booking.teacherId === input.userId;
  const counterpart = isTeacher ? booking.student : booking.teacher;
  const timeZone = isTeacher ? booking.teacher.timezone : booking.student.timezone;
  // QLT-09: the name, which is what the calendar owner needs to see, and which was already
  // here. Only the email address went away.
  const summary = `Lesson with ${counterpart.name}`;

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
        // QLT-09: no attendees on the update path either — see createEventForBooking. A
        // reschedule would otherwise re-disclose the address the create path no longer does.
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
