/**
 * Content-Security-Policy construction.
 *
 * SEC-12: `script-src` previously carried `'unsafe-inline'` in production, which removes the
 * main benefit of having a policy at all — any injected markup that reaches the DOM
 * executes. That matters here because the app renders a lot of user-authored text (teacher
 * bios, review comments, case messages) on pages served to other users.
 *
 * The policy is built per request so a fresh nonce can be embedded, which means it is set in
 * middleware rather than in next.config.ts. Next.js detects a nonce in the request's CSP
 * header and applies it to its own hydration scripts; next-themes takes one via its `nonce`
 * prop.
 */

export const CSP_NONCE_HEADER = "x-csp-nonce";

/** Emit a base64 nonce using Web Crypto, which is available in the edge runtime. */
export function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function buildContentSecurityPolicy(input: {
  nonce: string;
  isProduction: boolean;
}): string {
  const { nonce, isProduction } = input;

  // 'strict-dynamic' lets scripts loaded by a nonced script run without their own nonce,
  // which is how Next's chunk loading works. Browsers honouring it ignore the host
  // allowlist, so the explicit hosts remain only for older browsers that do not.
  //
  // Dev needs 'unsafe-eval' for React Refresh, and 'unsafe-inline' because the dev overlay
  // injects styles and scripts without a nonce. Browsers ignore 'unsafe-inline' whenever a
  // nonce is present, so it is harmless in production but pointless there too — hence
  // dev-only.
  const scriptSrc = [
    "script-src 'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(isProduction ? [] : ["'unsafe-eval'", "'unsafe-inline'"]),
    "https://accounts.google.com",
  ].join(" ");

  return [
    "default-src 'self'",
    scriptSrc,
    // Styles keep 'unsafe-inline': Tailwind, LiveKit's component styles and React's inline
    // style attributes all rely on it, and style injection is a far weaker vector than
    // script injection.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.supabase.co",
    "media-src 'self' blob: https://*.supabase.co https://*.livekit.cloud",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.livekit.cloud wss://*.livekit.cloud https://*.ingest.sentry.io https://*.paddle.com",
    // Paddle.js renders its checkout in an iframe from these hosts. Without frame-src the
    // overlay opens to a blank box and the browser reports only a CSP violation, which reads
    // like the checkout is broken rather than blocked.
    // Video embed hosts must match VIDEO_EMBED_HOSTS in src/lib/security/urls.ts — a test
    // asserts the two stay in sync. Without these, every lesson video iframe is blocked.
    "frame-src 'self' https://accounts.google.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com https://*.paddle.com",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}
