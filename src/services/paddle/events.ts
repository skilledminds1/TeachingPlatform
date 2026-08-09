import { isPaidPlanSlug, PADDLE_CATALOGUE, type PaidPlanSlug } from "@/services/paddle/catalogue";

/**
 * Reading a Paddle notification into something this application can act on (PAY-03).
 *
 * Parsing lives apart from the route so it can be tested against payload shapes without a
 * database, a signature, or an HTTP request — and so the route reads as "verify, interpret,
 * apply" rather than as a hundred lines of optional chaining.
 *
 * DELIBERATELY NARROW. Every field is read explicitly and anything unrecognised produces null
 * rather than a guess. A billing webhook that half-understands a payload is worse than one
 * that refuses it: the refusal is a 400 in a log, and the guess is a teacher on the wrong plan
 * or a subscription attached to the wrong organization.
 */

/** Paddle's subscription statuses. `trialing` is included because a trial still grants access. */
export type PaddleSubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "paused"
  | "canceled";

const SUBSCRIPTION_STATUSES: readonly string[] = [
  "active",
  "trialing",
  "past_due",
  "paused",
  "canceled",
];

export type ParsedPaddleEvent = {
  eventId: string;
  eventType: string;
  subscriptionId: string;
  customerId: string;
  status: PaddleSubscriptionStatus;
  /** Resolved from the price id, so the plan comes from OUR catalogue, not from the payload. */
  planSlug: PaidPlanSlug;
  interval: "monthly" | "annual";
  currentPeriodEnd: Date | null;
  /** What we attached at checkout. The organization is taken from here. */
  organizationId: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Which plan and interval a price id belongs to.
 *
 * Resolved from PADDLE_CATALOGUE rather than trusting anything in the payload. The notification
 * is signed, so it is not forged — but the catalogue is the only place that knows which plan a
 * price MEANS, and a price added in the dashboard without being added here must fail loudly
 * rather than resolve to whatever plan happens to sort first.
 */
export function planForPriceId(
  priceId: string,
): { planSlug: PaidPlanSlug; interval: "monthly" | "annual" } | null {
  for (const [slug, entry] of Object.entries(PADDLE_CATALOGUE)) {
    if (!isPaidPlanSlug(slug)) continue;
    if (entry.priceIds.monthly === priceId) return { planSlug: slug, interval: "monthly" };
    if (entry.priceIds.annual === priceId) return { planSlug: slug, interval: "annual" };
  }
  return null;
}

function parseDate(value: unknown): Date | null {
  const text = asString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Interpret a subscription.* notification.
 *
 * Returns null when anything required is missing or unrecognised. The caller turns that into a
 * 400, which Paddle retries — the right outcome for a payload we genuinely cannot read, and
 * far better than writing a half-understood state and returning 200 so it never comes back.
 */
export function parseSubscriptionEvent(payload: unknown): ParsedPaddleEvent | null {
  const root = asRecord(payload);
  if (!root) return null;

  const eventId = asString(root.event_id);
  const eventType = asString(root.event_type);
  const data = asRecord(root.data);
  if (!eventId || !eventType || !data) return null;
  if (!eventType.startsWith("subscription.")) return null;

  const subscriptionId = asString(data.id);
  const customerId = asString(data.customer_id);
  const status = asString(data.status);
  if (!subscriptionId || !customerId || !status) return null;
  if (!SUBSCRIPTION_STATUSES.includes(status)) return null;

  // The first item is the plan. Nothing in this catalogue sells add-ons, so a notification
  // carrying several items is a shape we do not understand and must not average out.
  const items = Array.isArray(data.items) ? data.items : null;
  if (!items || items.length !== 1) return null;
  const priceId = asString(asRecord(asRecord(items[0])?.price)?.id);
  if (!priceId) return null;

  const plan = planForPriceId(priceId);
  if (!plan) return null;

  const period = asRecord(data.current_billing_period);
  const customData = asRecord(data.custom_data);

  return {
    eventId,
    eventType,
    subscriptionId,
    customerId,
    status: status as PaddleSubscriptionStatus,
    planSlug: plan.planSlug,
    interval: plan.interval,
    currentPeriodEnd: parseDate(period?.ends_at),
    organizationId: asString(customData?.organization_id),
  };
}

/**
 * Whether a status should hold paid entitlements open.
 *
 * `past_due` counts as entitled ON PURPOSE. Paddle retries a failed payment over several days,
 * and cutting a teacher off at the first decline would cancel lessons that a retry two hours
 * later pays for. Access ends when Paddle gives up and the subscription reaches `canceled`.
 */
export function grantsAccess(status: PaddleSubscriptionStatus): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}
