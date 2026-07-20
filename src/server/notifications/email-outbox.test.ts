import { describe, expect, it } from "vitest";

import {
  buildEmailIdempotencyKey,
  isEmailAllowed,
  retryDelayMs,
} from "@/server/notifications/email-outbox";
import { renderEmailTemplate } from "@/services/email/templates";

describe("email outbox reliability", () => {
  it("uses bounded exponential retry backoff", () => {
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(2)).toBe(120_000);
    expect(retryDelayMs(5)).toBe(960_000);
    expect(retryDelayMs(100)).toBe(86_400_000);
  });

  it("gates optional categories while preserving mandatory delivery", () => {
    const disabled = {
      emailReminders: false,
      emailMessages: false,
      emailMarketing: false,
    };
    expect(isEmailAllowed("reminders", disabled)).toBe(false);
    expect(isEmailAllowed("messages", disabled)).toBe(false);
    expect(isEmailAllowed("marketing", disabled)).toBe(false);
    expect(isEmailAllowed("payment", disabled)).toBe(true);
    expect(isEmailAllowed("security", disabled)).toBe(true);
    expect(isEmailAllowed("legal", disabled)).toBe(true);
    expect(isEmailAllowed("admin_mediation", disabled)).toBe(true);
  });

  it("escapes all user-controlled template values", () => {
    const html = renderEmailTemplate({
      heading: `<script>alert("x")</script>`,
      paragraphs: ["Tom & Jerry's lesson"],
      action: { label: "Open > now", href: `https://example.com/?q="bad"&x=<x>` },
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Tom &amp; Jerry&#39;s lesson");
    expect(html).toContain("&quot;bad&quot;&amp;x=&lt;x&gt;");
  });

  it("builds stable, event-specific idempotency keys", () => {
    const first = buildEmailIdempotencyKey("booking.cancelled", "booking-1", "user-1");
    expect(buildEmailIdempotencyKey("booking.cancelled", "booking-1", "user-1")).toBe(first);
    expect(buildEmailIdempotencyKey("booking.cancelled", "booking-1", "user-2")).not.toBe(first);
    expect(first).toMatch(/^email:[a-f0-9]{64}$/);
  });
});
