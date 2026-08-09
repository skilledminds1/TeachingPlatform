/**
 * The Paddle catalogue, mapped to the plans this application already knows about.
 *
 * NOT YET LIVE. PayFast is still the rail that takes money; this exists so the ids created in
 * the Paddle dashboard on 9 August 2026 live somewhere reviewable instead of only in a web UI
 * nobody diffs.
 *
 * WHY THE IDS ARE HERE AND THE PRICES ARE NOT. A Paddle price id is an opaque, immutable
 * pointer — it is safe to commit, means nothing without the account, and has to match the
 * dashboard exactly or checkout fails. The AMOUNT behind it is deliberately not repeated here.
 * Paddle is the authority on what a plan costs, and writing $12 in two places is how a
 * catalogue and a codebase drift until a customer is quoted one number and charged another.
 * The dollar figures in the comments are orientation for a reader, not inputs to anything.
 *
 * Priced in USD, which Paddle converts to each buyer's local currency at checkout. That is the
 * point of the move: PayFast settles only in ZAR, so it could show a foreign price but never
 * pay one out. See 20260808160000_price_plans_in_zar for why a hand-held conversion rate is
 * not an acceptable substitute.
 */

/** Matches Plan.slug, minus `free` — a free plan never reaches a checkout. */
export type PaidPlanSlug = "starter" | "professional" | "business";

export type PaddlePlanCatalogueEntry = {
  productId: string;
  /** Price ids by billing interval, matching BillingInterval in the schema. */
  priceIds: { monthly: string; annual: string };
};

export const PADDLE_CATALOGUE: Record<PaidPlanSlug, PaddlePlanCatalogueEntry> = {
  starter: {
    productId: "pro_01kzkvh0xpnq4rbzhsf2w5f22t",
    priceIds: {
      monthly: "pri_01kzkvvfjfsmxxrsvjvmgvp5qm", // $12
      annual: "pri_01kzkvytj1wan5vh18gt3cngx8", // $120
    },
  },
  professional: {
    productId: "pro_01kzkvjr874rzaqga67jy446mk",
    priceIds: {
      monthly: "pri_01kzkw20x8jkmjsrkcckvskc28", // $29
      annual: "pri_01kzkw4yzjpeqppjh62sqzjaxj", // $290
    },
  },
  business: {
    productId: "pro_01kzkvm4bfzy2e6q7g1f5hn0q9",
    priceIds: {
      monthly: "pri_01kzkw7wedwfhxq0xya1jswdks", // $49
      annual: "pri_01kzkwakjn66bjcb1crrmbyg26", // $490
    },
  },
};

export const PAID_PLAN_SLUGS = Object.keys(PADDLE_CATALOGUE) as PaidPlanSlug[];

export function isPaidPlanSlug(slug: string): slug is PaidPlanSlug {
  return slug in PADDLE_CATALOGUE;
}

/**
 * The price id to open a checkout with.
 *
 * Throws rather than returning undefined: a missing id cannot be recovered from at the till,
 * and a checkout opened with `undefined` fails at Paddle with a message that says nothing
 * about which plan the caller meant.
 */
export function paddlePriceId(slug: PaidPlanSlug, interval: "monthly" | "annual"): string {
  const entry = PADDLE_CATALOGUE[slug];
  if (!entry) throw new Error(`No Paddle catalogue entry for plan "${slug}"`);
  const priceId = entry.priceIds[interval];
  if (!priceId) throw new Error(`No Paddle ${interval} price for plan "${slug}"`);
  return priceId;
}
