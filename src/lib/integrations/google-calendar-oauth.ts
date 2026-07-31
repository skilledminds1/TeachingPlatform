/**
 * Shared constants for the Google Calendar OAuth round-trip.
 *
 * Kept out of the route files so /connect and /callback can agree on the cookie without
 * either importing the other's module (route modules should export only handlers).
 */
export const GOOGLE_CALENDAR_STATE_COOKIE = "gcal_connect_state";

export const GOOGLE_CALENDAR_STATE_TTL_SECONDS = 10 * 60;

export const GOOGLE_CALENDAR_STATE_COOKIE_PATH = "/api/integrations/google-calendar";
