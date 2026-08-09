import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logger } from "@/lib/observability/logger";
import { grantsAccess, parseSubscriptionEvent } from "@/services/paddle/events";
import { verifyPaddleSignature } from "@/services/paddle/signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Paddle notifications (PAY-03).
 *
 * NOT YET THE LIVE RAIL. PayFast still takes the money; this exists so the Paddle side can be
 * proved with Paddle's own simulator before anything is cut over.
 *
 * Three things this route does differently from the PayFast ITN handler next door, each for a
 * reason worth keeping:
 *
 *  - It reads the RAW body and verifies before parsing. Re-serialising JSON reorders keys and
 *    the HMAC stops matching, so `await request.json()` first would reject every legitimate
 *    notification while looking exactly like a wrong secret.
 *  - It has no second line of defence. PayFast could be called back and asked whether a
 *    notification was real; Paddle offers no equivalent, so the signature IS the boundary.
 *  - It answers 200 to events it does not handle. The destination is subscribed to everything,
 *    and 400ing an event we simply do not care about would have Paddle retry it for days and
 *    eventually disable the destination — taking the events we DO care about with it.
 */

/** Paddle's statuses, mapped onto the three this schema has. */
function toSubscriptionStatus(paddleStatus: string): "active" | "past_due" | "cancelled" {
  if (paddleStatus === "past_due") return "past_due";
  // `paused` lands here with `cancelled`: it grants no access and is not being billed, which is
  // what `cancelled` means to every entitlement check in this application.
  return grantsAccess(paddleStatus as never) ? "active" : "cancelled";
}

export async function POST(request: Request) {
  // Raw, exactly as sent. Everything below depends on these bytes being untouched.
  const rawBody = await request.text();

  const verification = verifyPaddleSignature({
    rawBody,
    signatureHeader: request.headers.get("paddle-signature"),
    secret: env.PADDLE_WEBHOOK_SECRET,
  });

  if (!verification.ok) {
    // Logged at error because every one of these is either a misconfiguration or someone
    // probing a billing endpoint, and both are worth seeing.
    logger.error("paddle_itn_rejected", { reason: verification.reason });
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Malformed JSON", { status: 400 });
  }

  const event = parseSubscriptionEvent(payload);
  if (!event) {
    // Either an event type this route does not handle, or a subscription payload it could not
    // read. Answering 200 to the first is deliberate; see the note at the top. The second is
    // rare enough, and logged loudly enough, to be worth the same treatment rather than
    // risking the destination being disabled over a payload shape we can fix and redeploy.
    const eventType =
      typeof payload === "object" && payload !== null
        ? String((payload as Record<string, unknown>).event_type ?? "unknown")
        : "unknown";
    logger.info("paddle_itn_ignored", { eventType });
    return NextResponse.json({ ok: true, ignored: eventType });
  }

  /**
   * Find the organization three ways, most trustworthy first.
   *
   * custom_data is what WE attached when opening the checkout, so it is the only one that
   * cannot be confused by a teacher who somehow has two subscriptions. The other two exist so
   * a renewal still lands if custom_data is ever absent — Paddle echoes it, but a subscription
   * created any other way (support, a migration, the dashboard) would not carry it.
   */
  const organization =
    (event.organizationId
      ? await db.organization.findUnique({ where: { id: event.organizationId } })
      : null) ??
    (await db.organization.findFirst({
      where: { paddleSubscriptionId: event.subscriptionId },
    })) ??
    (await db.organization.findFirst({ where: { paddleCustomerId: event.customerId } }));

  if (!organization) {
    // 200, not 404. Paddle would retry a 404 for days, and no amount of retrying will conjure
    // an organization that does not exist — but the log line is how we find out it happened.
    logger.error("paddle_itn_no_organization", {
      eventId: event.eventId,
      subscriptionId: event.subscriptionId,
      customerId: event.customerId,
      organizationIdFromCustomData: event.organizationId,
    });
    return NextResponse.json({ ok: true, ignored: "unknown_organization" });
  }

  const plan = await db.plan.findFirst({ where: { slug: event.planSlug } });
  if (!plan) {
    logger.error("paddle_itn_unknown_plan", { eventId: event.eventId, slug: event.planSlug });
    return new NextResponse("Plan not found", { status: 500 });
  }

  try {
    await db.$transaction(async (tx) => {
      // The unique index on providerEventId is what makes a replay a no-op rather than a second
      // application of the same state change. Paddle retries on any non-2xx, so replays are
      // routine rather than exceptional.
      await tx.billingEvent.create({
        data: {
          organizationId: organization.id,
          provider: "paddle",
          providerEventId: event.eventId,
          eventType: event.eventType,
          payload: payload as never,
        },
      });

      await tx.organization.update({
        where: { id: organization.id },
        data: {
          planId: plan.id,
          billingInterval: event.interval,
          subscriptionStatus: toSubscriptionStatus(event.status),
          paddleCustomerId: event.customerId,
          paddleSubscriptionId: event.subscriptionId,
          currentPeriodEnd: event.currentPeriodEnd,
          // Paddle owns dunning now. It retries a failed card on its own schedule and reports
          // the outcome, so the local grace and dunning counters are cleared rather than
          // advanced — leaving them set would have run-lifecycle.ts dunning a teacher in
          // parallel with Paddle, for the same failure, with different wording.
          graceStartedAt: null,
          graceEndsAt: null,
          dunningStage: 0,
          dunningLastNoticeAt: null,
        },
      });
    });
  } catch (error) {
    // A duplicate providerEventId means this notification has already been applied. That is a
    // success from Paddle's point of view and must answer 200, or it retries for ever.
    if (String(error).includes("Unique constraint")) {
      logger.info("paddle_itn_duplicate", { eventId: event.eventId });
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw error;
  }

  logger.info("paddle_itn_applied", {
    eventId: event.eventId,
    eventType: event.eventType,
    organizationId: organization.id,
    planSlug: event.planSlug,
    status: event.status,
  });

  return NextResponse.json({ ok: true });
}
