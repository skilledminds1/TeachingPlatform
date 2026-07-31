import { describe, expect, it } from "vitest";

import {
  isAllowedVideoEmbedUrl,
  isHttpsUrl,
  normalizeVideoEmbedUrl,
  VIDEO_EMBED_HOSTS,
} from "./urls";

describe("isHttpsUrl", () => {
  it("accepts https only", () => {
    expect(isHttpsUrl("https://example.com/a")).toBe(true);
    expect(isHttpsUrl("http://example.com/a")).toBe(false);
    expect(isHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpsUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isHttpsUrl("not a url")).toBe(false);
  });
});

describe("normalizeVideoEmbedUrl", () => {
  it("rejects the schemes zod's z.url() lets through", () => {
    expect(normalizeVideoEmbedUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeVideoEmbedUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(normalizeVideoEmbedUrl("http://www.youtube.com/watch?v=abc123")).toBeNull();
  });

  it("rejects hosts that are not allowlisted", () => {
    expect(normalizeVideoEmbedUrl("https://evil.com/embed/x")).toBeNull();
    expect(normalizeVideoEmbedUrl("https://youtube.com.evil.com/watch?v=x")).toBeNull();
    expect(normalizeVideoEmbedUrl("https://notvimeo.com/12345")).toBeNull();
  });

  it("normalises every YouTube share form to the no-cookie embed host", () => {
    const expected = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
    expect(normalizeVideoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(expected);
    expect(normalizeVideoEmbedUrl("https://youtube.com/watch?v=dQw4w9WgXcQ&t=30")).toBe(expected);
    expect(normalizeVideoEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(expected);
    expect(normalizeVideoEmbedUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(expected);
    expect(normalizeVideoEmbedUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(expected);
    expect(normalizeVideoEmbedUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(expected);
  });

  it("normalises Vimeo, preserving the unlisted-video hash", () => {
    expect(normalizeVideoEmbedUrl("https://vimeo.com/123456789")).toBe(
      "https://player.vimeo.com/video/123456789",
    );
    expect(normalizeVideoEmbedUrl("https://vimeo.com/123456789/abc123")).toBe(
      "https://player.vimeo.com/video/123456789?h=abc123",
    );
    expect(normalizeVideoEmbedUrl("https://player.vimeo.com/video/123456789")).toBe(
      "https://player.vimeo.com/video/123456789",
    );
  });

  it("normalises Loom share links", () => {
    expect(normalizeVideoEmbedUrl("https://www.loom.com/share/abc123def456")).toBe(
      "https://www.loom.com/embed/abc123def456",
    );
    expect(normalizeVideoEmbedUrl("https://loom.com/embed/abc123def456")).toBe(
      "https://www.loom.com/embed/abc123def456",
    );
  });

  it("rejects an allowlisted host with an unusable path", () => {
    expect(normalizeVideoEmbedUrl("https://www.youtube.com/")).toBeNull();
    expect(normalizeVideoEmbedUrl("https://vimeo.com/notanid")).toBeNull();
  });

  it("always produces a URL that passes isAllowedVideoEmbedUrl", () => {
    const inputs = [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://vimeo.com/123456789",
      "https://www.loom.com/share/abc123",
    ];
    for (const input of inputs) {
      const normalised = normalizeVideoEmbedUrl(input);
      expect(normalised).not.toBeNull();
      expect(isAllowedVideoEmbedUrl(normalised as string)).toBe(true);
    }
  });
});

describe("CSP alignment", () => {
  it("every allowlisted host appears in the frame-src directive", async () => {
    const { readFileSync } = await import("node:fs");
    const config = readFileSync("next.config.ts", "utf8");
    const frameSrc = /"frame-src ([^"]+)"/.exec(config)?.[1] ?? "";
    for (const host of VIDEO_EMBED_HOSTS) {
      expect(frameSrc, `frame-src is missing ${host}, so embeds will be blocked`).toContain(host);
    }
  });
});
