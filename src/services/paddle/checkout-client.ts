import { env } from "@/lib/env";

/**
 * Opening Paddle's checkout overlay from the browser (PAY-03).
 *
 * Paddle.js is loaded on demand rather than on every page. It is a third-party script on a
 * platform where most sessions never reach billing at all — a student booking a lesson has no
 * reason to pay for the bytes, and no reason to be exposed to the script either.
 *
 * The overlay takes a PRICE ID, not an amount. Nothing here computes what anything costs, and
 * that is the point: the last rail let this application build a charge, and three separate
 * billing defects came out of the one conversion rate it needed to do it.
 */

type PaddleCheckoutOptions = {
  items: Array<{ priceId: string; quantity: number }>;
  customer?: { email: string };
  customData?: Record<string, string>;
  discountId?: string;
  settings?: { displayMode?: string; theme?: string; successUrl?: string };
};

type PaddleGlobal = {
  Environment?: { set: (environment: string) => void };
  Initialize: (options: { token: string }) => void;
  Checkout: { open: (options: PaddleCheckoutOptions) => void };
};

declare global {
  interface Window {
    Paddle?: PaddleGlobal;
  }
}

const PADDLE_JS_SRC = "https://cdn.paddle.com/paddle/v2/paddle.js";

let loader: Promise<PaddleGlobal> | null = null;

/**
 * Load and initialise Paddle.js exactly once.
 *
 * The promise is cached rather than the boolean, so two clicks in quick succession await the
 * same load instead of racing two script tags and initialising twice.
 */
function loadPaddle(): Promise<PaddleGlobal> {
  if (loader) return loader;

  loader = new Promise<PaddleGlobal>((resolve, reject) => {
    const token = env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    if (!token) {
      reject(new Error("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is not set"));
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PADDLE_JS_SRC}"]`);

    const initialise = () => {
      const paddle = window.Paddle;
      if (!paddle) {
        reject(new Error("Paddle.js loaded but window.Paddle is missing"));
        return;
      }
      // Sandbox has to be selected BEFORE Initialize, or the token is checked against the live
      // environment and rejected with a message that says nothing about which environment it
      // was expecting.
      if (env.NEXT_PUBLIC_PADDLE_ENVIRONMENT === "sandbox") {
        paddle.Environment?.set("sandbox");
      }
      paddle.Initialize({ token });
      resolve(paddle);
    };

    if (existing) {
      if (window.Paddle) initialise();
      else existing.addEventListener("load", initialise, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = PADDLE_JS_SRC;
    script.async = true;
    script.addEventListener("load", initialise, { once: true });
    script.addEventListener("error", () => {
      // Reset so a later attempt can retry. A cached rejected promise would make one blocked
      // request — an ad blocker, a flaky network — permanent for the rest of the session.
      loader = null;
      reject(new Error("Paddle.js failed to load"));
    });
    document.head.appendChild(script);
  });

  return loader;
}

/**
 * Open the checkout for one price.
 *
 * `organizationId` goes into custom_data, which Paddle echoes on every notification for the
 * life of the subscription. It is the only identifier the webhook can trust to attach a
 * subscription to the right organization, so it is not optional.
 */
export async function openPaddleCheckout(input: {
  priceId: string;
  organizationId: string;
  email: string;
  /** A Paddle discount id, when an active sale has one. Omitted entirely when null. */
  discountId?: string | null;
  successUrl?: string;
}): Promise<void> {
  const paddle = await loadPaddle();
  paddle.Checkout.open({
    items: [{ priceId: input.priceId, quantity: 1 }],
    customer: { email: input.email },
    customData: { organization_id: input.organizationId },
    // Sent only when there is one. Paddle rejects a null discountId rather than ignoring it,
    // so the key has to be absent rather than present-and-empty.
    ...(input.discountId ? { discountId: input.discountId } : {}),
    settings: {
      displayMode: "overlay",
      ...(input.successUrl ? { successUrl: input.successUrl } : {}),
    },
  });
}
