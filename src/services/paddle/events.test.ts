import { describe, expect, it } from "vitest";

import { PADDLE_CATALOGUE } from "./catalogue";
import { grantsAccess, parseSubscriptionEvent, planForPriceId } from "./events";

/**
 * A billing webhook that half-understands a payload is worse than one that refuses it. The
 * refusal is a 400 in a log that Paddle retries; the guess is a teacher on the wrong plan, or a
 * live subscription attached to the wrong organization.
 */
function subscriptionEvent(overrides: Record<string, unknown> = {}) {
  // `data` is merged, not replaced, and is pulled OUT of the top-level spread — leaving it in
  // put the partial override back over the merged object, so every fixture that customised one
  // field silently lost every other one.
  const { data: dataOverrides, ...rest } = overrides;
  return {
    event_id: "evt_1",
    event_type: "subscription.created",
    ...rest,
    data: {
      id: "sub_1",
      customer_id: "ctm_1",
      status: "active",
      custom_data: { organization_id: "org-1" },
      current_billing_period: {
        starts_at: "2026-08-09T10:00:00.000Z",
        ends_at: "2026-09-09T10:00:00.000Z",
      },
      items: [{ price: { id: PADDLE_CATALOGUE.starter.priceIds.monthly } }],
      ...(dataOverrides as Record<string, unknown> | undefined),
    },
  };
}

describe("resolving a price id to a plan", () => {
  /**
   * The plan comes from OUR catalogue, never from the payload. The notification is signed so
   * it is not forged, but only the catalogue knows what a price MEANS.
   */
  it("maps every catalogue price back to its plan and interval", () => {
    for (const [slug, entry] of Object.entries(PADDLE_CATALOGUE)) {
      expect(planForPriceId(entry.priceIds.monthly)).toEqual({
        planSlug: slug,
        interval: "monthly",
      });
      expect(planForPriceId(entry.priceIds.annual)).toEqual({
        planSlug: slug,
        interval: "annual",
      });
    }
  });

  /**
   * A price created in the dashboard and not added here must fail loudly rather than resolve
   * to whichever plan happens to sort first.
   */
  it("refuses a price it has never heard of", () => {
    expect(planForPriceId("pri_something_created_in_the_dashboard")).toBeNull();
  });
});

describe("parsing a subscription notification", () => {
  it("reads the fields the billing state depends on", () => {
    const parsed = parseSubscriptionEvent(subscriptionEvent());

    expect(parsed).toMatchObject({
      eventId: "evt_1",
      subscriptionId: "sub_1",
      customerId: "ctm_1",
      status: "active",
      planSlug: "starter",
      interval: "monthly",
      organizationId: "org-1",
    });
    expect(parsed?.currentPeriodEnd?.toISOString()).toBe("2026-09-09T10:00:00.000Z");
  });

  it("refuses a payload missing anything it needs", () => {
    for (const broken of [
      null,
      {},
      "not an object",
      subscriptionEvent({ event_id: undefined }),
      subscriptionEvent({ data: { id: undefined } }),
      subscriptionEvent({ data: { customer_id: undefined } }),
      subscriptionEvent({ data: { status: undefined } }),
    ]) {
      expect(parseSubscriptionEvent(broken)).toBeNull();
    }
  });

  it("refuses a status it does not recognise", () => {
    expect(parseSubscriptionEvent(subscriptionEvent({ data: { status: "quantum" } }))).toBeNull();
  });

  it("refuses a price outside the catalogue", () => {
    expect(
      parseSubscriptionEvent(subscriptionEvent({ data: { items: [{ price: { id: "pri_x" } }] } })),
    ).toBeNull();
  });

  /**
   * Nothing in this catalogue sells add-ons, so several items is a shape we do not understand.
   * Taking the first would silently charge for one thing and grant another.
   */
  it("refuses a notification carrying more than one item", () => {
    const twoItems = subscriptionEvent({
      data: {
        items: [
          { price: { id: PADDLE_CATALOGUE.starter.priceIds.monthly } },
          { price: { id: PADDLE_CATALOGUE.business.priceIds.annual } },
        ],
      },
    });
    expect(parseSubscriptionEvent(twoItems)).toBeNull();
  });

  it("ignores an event that is not about a subscription", () => {
    expect(
      parseSubscriptionEvent(subscriptionEvent({ event_type: "transaction.completed" })),
    ).toBeNull();
  });

  /** Cancellation carries no next period, and that must parse rather than throw. */
  it("accepts a cancellation with no billing period", () => {
    const parsed = parseSubscriptionEvent(
      subscriptionEvent({
        event_type: "subscription.canceled",
        data: { status: "canceled", current_billing_period: null },
      }),
    );
    expect(parsed?.status).toBe("canceled");
    expect(parsed?.currentPeriodEnd).toBeNull();
  });

  /**
   * A checkout that never carried custom_data still parses — the route falls back to matching
   * on customer id — but the field has to survive as null rather than crash the parse.
   */
  it("tolerates a missing organization id", () => {
    const parsed = parseSubscriptionEvent(subscriptionEvent({ data: { custom_data: null } }));
    expect(parsed?.organizationId).toBeNull();
    expect(parsed?.subscriptionId).toBe("sub_1");
  });
});

describe("which statuses keep the lights on", () => {
  /**
   * past_due grants access ON PURPOSE. Paddle retries a failed payment over several days, and
   * cutting a teacher off at the first decline cancels lessons that a retry two hours later
   * pays for.
   */
  it("keeps a past_due subscription entitled while Paddle retries", () => {
    expect(grantsAccess("past_due")).toBe(true);
  });

  it("entitles active and trialing", () => {
    expect(grantsAccess("active")).toBe(true);
    expect(grantsAccess("trialing")).toBe(true);
  });

  it("stops at canceled, which is where Paddle gives up", () => {
    expect(grantsAccess("canceled")).toBe(false);
  });

  /** A paused subscription is not being billed, so it must not keep paid features open. */
  it("does not entitle a paused subscription", () => {
    expect(grantsAccess("paused")).toBe(false);
  });
});
