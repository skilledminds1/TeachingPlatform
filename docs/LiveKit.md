# LiveKit Cloud Video Sessions

## Configuration

Set these server-side variables:

```env
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
```

`LIVEKIT_API_SECRET` must never be exposed through a `NEXT_PUBLIC_` variable. The WebSocket URL is
safe to return to authenticated participants; access is controlled by signed tokens.

## Lifecycle

1. A student reserves a booking.
2. Until payment webhooks are connected, the teacher confirms it manually.
3. Confirmation creates a two-participant LiveKit room and marks the booking confirmed.
4. The teacher starts the room up to 15 minutes before the lesson.
5. The server authorizes each participant and signs a short-lived, room-bound JWT.
6. The React client connects with `LiveKitRoom`.
7. The teacher ends the lesson, marking the session ended and booking completed.
8. The student can submit a moderated review.

Rooms use deterministic names, a two-participant maximum, five-minute departure grace period,
and tokens that expire 30 minutes after the scheduled end. Cancelling a booking deletes its room.

## Security

- API credentials remain server-only.
- Tokens are issued only to the booking's teacher or student.
- Each JWT is bound to the participant identity and one room.
- Teacher tokens receive room-admin permissions.
- The app enforces the scheduled join window before signing a token.
