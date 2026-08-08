import { serializeJsonLd } from "@/lib/seo/structured-data";

/**
 * Structured data for rich results (GLO-02).
 *
 * NO CSP NONCE, deliberately. `type="application/ld+json"` is a data block: the browser
 * parses it as JSON and never executes it, so `script-src` — which governs script execution
 * — does not apply, and this is the shape Next.js's own documentation uses on sites with a
 * strict policy. Setting one is worse than useless here, because React refuses to serialize
 * `nonce` to the client (an injected script could otherwise read and reuse it), so the
 * attribute is present on the server and empty on the client. That is an unpatched hydration
 * mismatch on every teacher profile page, and `suppressHydrationWarning` does not cover it —
 * React special-cases the attribute. Measured, not assumed: the warning was reproduced and
 * then eliminated by removing the nonce.
 *
 * Worth confirming once against production, where `'unsafe-inline'` is absent and this file
 * cannot be tested locally: run a profile URL through Google's Rich Results Test, which
 * executes the real policy. If it reports no structured data, the nonce is the reason.
 *
 * THE ESCAPE still matters. The payload carries user-authored text — bios, headlines,
 * names — and `JSON.stringify` does not escape `<`, so a bio containing `</script>` would
 * close this element early and everything after it would parse as HTML. serializeJsonLd
 * handles it, and is tested.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
