/**
 * Teacher payment links — the rail by which a student pays a teacher without the platform
 * ever touching the money.
 *
 * The teacher saves a hosted-checkout link from their own payment provider. The platform
 * renders an anchor to it. No keys, no webhooks, no partner approval, and — the point — no
 * moment at which platform-controlled funds exist. Every regulator examined draws the line at
 * possession: SARB Directive 1 of 2007 defines a beneficiary service provider as one who
 * "accepts money ... on behalf of a beneficiary", PSD2 Art 3(j) excludes technical providers
 * that never come "into the possession of the funds". A platform that accepts nothing is
 * outside both.
 *
 * THE SECURITY PROBLEM THIS FILE EXISTS FOR. A stored URL rendered as an href, controlled by
 * a teacher, is a redirect to attacker-controllable content the moment an account is taken
 * over — and a teacher profile then becomes a laundering storefront or a phishing page under
 * the platform's own branding. So the URL is not free text. It is constrained to an exact host
 * on this list, https only, parsed rather than string-matched.
 *
 * WHY HOSTED CHECKOUTS ONLY, AND NOT WALLET HANDLES. Pix keys, UPI ids, M-Pesa numbers and
 * PayPal friends-and-family all "work", and teachers reach for them to dodge provider fees.
 * They are refused deliberately: they carry no chargeback, no dispute path, no receipt and no
 * KYC on the payee, so a defrauded student has no remedy and the platform can offer none
 * either. Requiring a regulated PSP's hosted page outsources KYC and dispute handling to that
 * PSP, which is the single strongest anti-abuse control available to a zero-touch design.
 */

export type PaymentLinkProvider = {
  /** Stable key. Stored on the profile, so do not rename without a migration. */
  id: string;
  name: string;
  /**
   * Exact hostnames, lowercase. Matched by equality against a parsed URL's hostname — never
   * by `startsWith` or `includes`, both of which `evil.com/buy.stripe.com` defeats.
   */
  hosts: readonly string[];
  /**
   * ISO 3166-1 alpha-2 codes where a teacher can open an account and be paid, or "global".
   * This is the PAYEE side: where the teacher can receive, not where a student can pay from.
   */
  countries: readonly string[] | "global";
  /**
   * Whether one saved link can take any lesson price. Per-amount products force the teacher to
   * mint a new link per lesson, which they will not reliably do, so they rank lower.
   */
  reusable: boolean;
  /** Shown to the teacher so they know what to paste. */
  hint: string;
};

/**
 * HOSTS MUST BE VERIFIED AGAINST A REAL CHECKOUT BEFORE A PROVIDER IS ADDED.
 *
 * A wrong hostname here fails safe — a legitimate link is rejected and the teacher complains
 * — whereas a missing constraint fails open. So the list is deliberately short and grows on
 * evidence. Last reviewed 2026-08-08; re-verify when adding, because providers do move
 * checkout to new domains.
 */
export const PAYMENT_LINK_PROVIDERS: readonly PaymentLinkProvider[] = [
  {
    id: "stripe_payment_link",
    name: "Stripe Payment Link",
    hosts: ["buy.stripe.com"],
    // Stripe does NOT onboard South African businesses, so this is unavailable to most of the
    // launch market. Kept because it is the best option for teachers who can open an account.
    countries: [
      "AU", "AT", "BE", "BR", "BG", "CA", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE",
      "GR", "HK", "HU", "IE", "IT", "JP", "LV", "LT", "LU", "MT", "MX", "NL", "NZ", "NO",
      "PL", "PT", "RO", "SG", "SK", "SI", "ES", "SE", "CH", "TH", "AE", "GB", "US",
    ],
    reusable: true,
    hint: "Create a Payment Link and let customers choose what to pay, so one link covers any lesson price.",
  },
  {
    id: "square",
    name: "Square",
    // square.link is the short form Square mints; checkout.square.site is the long form of the
    // same page. Both are Square-hosted, so both must be allowed or a teacher who pastes the
    // one they were shown is rejected for no reason they can see.
    hosts: ["square.link", "checkout.square.site"],
    // Square does not onboard South African sellers, so this is for teachers abroad. Added
    // when PayPal.Me was removed, because that left Wise and Revolut as the only options for
    // a teacher outside the listed countries.
    countries: ["AU", "CA", "FR", "IE", "JP", "ES", "GB", "US"],
    reusable: true,
    hint: "A Square 'Collect a payment' link, which lets the student enter the lesson price. An item link is fixed to one price and will not work across different lesson lengths.",
  },
  {
    id: "yoco",
    name: "Yoco",
    hosts: ["pay.yoco.com"],
    countries: ["ZA"],
    reusable: true,
    hint: "Yoco payment links. A sole proprietor can sign up with a South African ID and bank account.",
  },
  {
    id: "payfast",
    name: "PayFast",
    hosts: ["payfast.co.za", "www.payfast.co.za"],
    countries: ["ZA"],
    reusable: true,
    hint: "A PayFast Pay Now button or payment request page.",
  },
  {
    id: "snapscan",
    name: "SnapScan",
    hosts: ["pos.snapscan.io"],
    countries: ["ZA"],
    reusable: true,
    hint: "A SnapScan pay link. Students can pay by card or the SnapScan app.",
  },
  {
    id: "paystack",
    name: "Paystack",
    hosts: ["paystack.com", "paystack.shop"],
    countries: ["ZA", "NG", "GH", "KE", "CI", "EG"],
    reusable: true,
    hint: "A Paystack payment page.",
  },
  {
    id: "flutterwave",
    name: "Flutterwave",
    hosts: ["flutterwave.com"],
    countries: ["NG", "GH", "KE", "UG", "TZ", "RW", "ZA", "EG"],
    reusable: true,
    hint: "A Flutterwave payment link.",
  },
  {
    id: "razorpay",
    name: "Razorpay",
    hosts: ["rzp.io", "pages.razorpay.com"],
    // PayPal has had no domestic India rail since 2021 and Stripe India is invite-only, so
    // this is the practical option for Indian teachers.
    countries: ["IN"],
    reusable: true,
    hint: "A Razorpay Payment Page. Sole proprietors onboard with PAN and Aadhaar.",
  },
  {
    id: "revolut",
    name: "Revolut",
    hosts: ["revolut.me"],
    countries: "global",
    reusable: true,
    hint: "A Revolut payment link.",
  },
  {
    id: "wise",
    name: "Wise",
    hosts: ["wise.com"],
    countries: "global",
    reusable: true,
    hint: "A Wise payment link with an open amount, so the payer chooses what to send.",
  },
] as const;

export type NormalizedPaymentLink = {
  url: string;
  host: string;
  providerId: string;
  providerName: string;
};

export type PaymentLinkRejection =
  | "unparseable"
  | "not_https"
  | "host_not_allowed"
  | "has_credentials";

/**
 * Validate and canonicalise a pasted payment link.
 *
 * Parses rather than pattern-matches. `startsWith("https://buy.stripe.com")` is defeated by
 * `https://buy.stripe.com.evil.com`, and a backslash defeats several naive path checks — the
 * WHATWG parser treats `\` as `/` for special schemes, which is the same trick that produced
 * the open redirect in SEC-04.
 */
export function normalizePaymentLinkUrl(
  value: string,
): { ok: true; link: NormalizedPaymentLink } | { ok: false; reason: PaymentLinkRejection } {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return { ok: false, reason: "unparseable" };
  }

  if (url.protocol !== "https:") return { ok: false, reason: "not_https" };
  // `https://buy.stripe.com@evil.com/` parses with hostname evil.com, but a human reading the
  // string sees Stripe. Refuse credentials outright rather than relying on everyone
  // downstream reading `hostname` and never `href`.
  if (url.username || url.password) return { ok: false, reason: "has_credentials" };

  const host = url.hostname.toLowerCase();
  const provider = PAYMENT_LINK_PROVIDERS.find((candidate) =>
    candidate.hosts.includes(host),
  );
  if (!provider) return { ok: false, reason: "host_not_allowed" };

  // Rebuilt from parsed parts. The stored value is then something this code produced, not
  // something a teacher pasted — no fragment, no embedded credentials, no surprises.
  const canonical = `https://${host}${url.pathname}${url.search}`;

  return {
    ok: true,
    link: { url: canonical, host, providerId: provider.id, providerName: provider.name },
  };
}

/** Providers a teacher in this country can realistically open an account with. */
export function paymentLinkProvidersForCountry(
  country: string | null | undefined,
): readonly PaymentLinkProvider[] {
  if (!country) return PAYMENT_LINK_PROVIDERS.filter((p) => p.countries === "global");
  const code = country.toUpperCase();
  return PAYMENT_LINK_PROVIDERS.filter(
    (provider) => provider.countries === "global" || provider.countries.includes(code),
  );
}

export function paymentLinkRejectionMessage(reason: PaymentLinkRejection): string {
  switch (reason) {
    case "not_https":
      return "The link must start with https://";
    case "has_credentials":
      return "That link contains a username or password. Paste the plain checkout link.";
    case "host_not_allowed":
      return "We only accept links from payment providers on our list, so students always land on a real, regulated checkout.";
    case "unparseable":
      return "That does not look like a web address.";
  }
}
