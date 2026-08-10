import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEC-18: the import pipeline, with the CDN and the bucket stubbed.
 *
 * The bytes and headers used here are the ones a real Google avatar returns —
 * `Content-Type: image/png`, 200, no redirect, a few hundred bytes — checked against
 * lh3.googleusercontent.com while fixing this.
 */
const storage = vi.hoisted(() => ({
  upload: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
  getPublicUrl: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ storage: { from: () => storage } }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { importProviderAvatar } = await import("./provider-avatar");

const USER_ID = "8f3c2a10-0000-4000-8000-000000000001";
const GOOGLE_AVATAR = "https://lh3.googleusercontent.com/a/ACg8ocLWa9QM=s96-c";
const PUBLIC_URL = "https://project.supabase.co/storage/v1/object/public/avatars/x.png";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

function response(body: BodyInit | null, init: ResponseInit): Response {
  return new Response(body, init);
}

function imageResponse(bytes: Uint8Array = PNG_BYTES, contentType = "image/png"): Response {
  // .buffer because BodyInit takes an ArrayBuffer, not a view over one.
  return response(bytes.buffer as ArrayBuffer, {
    status: 200,
    headers: { "content-type": contentType },
  });
}

beforeEach(() => {
  storage.upload.mockResolvedValue({ error: null });
  storage.list.mockResolvedValue({ data: [] });
  storage.remove.mockResolvedValue({ error: null });
  storage.getPublicUrl.mockReturnValue({ data: { publicUrl: PUBLIC_URL } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("importProviderAvatar", () => {
  it("stores the fetched bytes and returns our own URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(imageResponse()));

    const result = await importProviderAvatar({ userId: USER_ID, url: GOOGLE_AVATAR });

    expect(result).toBe(PUBLIC_URL);
    const [path, bytes, options] = storage.upload.mock.calls[0]!;
    expect(path).toMatch(new RegExp(`^${USER_ID}/provider-\\d+\\.png$`));
    expect(bytes).toEqual(PNG_BYTES);
    expect(options).toMatchObject({ contentType: "image/png" });
  });

  it("does not fetch a URL from a host outside the allowlist", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await importProviderAvatar({
      userId: USER_ID,
      url: "https://169.254.169.254/latest/meta-data/",
    });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses bytes that do not match the type the CDN declared", async () => {
    // Declared image/png, actually something else. nosniff protects the browser; this
    // protects the bucket from becoming a host for whatever the bytes really are.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(imageResponse(new Uint8Array([0x3c, 0x73, 0x76, 0x67]))),
    );

    expect(await importProviderAvatar({ userId: USER_ID, url: GOOGLE_AVATAR })).toBeNull();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("refuses a content type that is not an image we accept", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(imageResponse(PNG_BYTES, "image/svg+xml")));

    expect(await importProviderAvatar({ userId: USER_ID, url: GOOGLE_AVATAR })).toBeNull();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("follows a redirect that stays on an allowlisted host", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response(null, {
          status: 302,
          headers: { location: "https://lh6.googleusercontent.com/a/moved=s96-c" },
        }),
      )
      .mockResolvedValueOnce(imageResponse());
    vi.stubGlobal("fetch", fetchMock);

    expect(await importProviderAvatar({ userId: USER_ID, url: GOOGLE_AVATAR })).toBe(PUBLIC_URL);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  /** The reason the fetch is manual: a redirect must not be able to leave the allowlist. */
  it("stops at a redirect that leaves the allowlist", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await importProviderAvatar({ userId: USER_ID, url: GOOGLE_AVATAR })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  /**
   * The upload actions clear every other file in the folder, because the user just chose the
   * survivor. An import is not a choice the user made, so a photo they uploaded themselves
   * must still be there afterwards.
   */
  it("clears only previous imports, never a photo the user uploaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(imageResponse()));
    storage.list.mockResolvedValue({
      data: [
        { name: "provider-1700000000000.png" },
        { name: "profile-1700000000001.jpg" },
      ],
    });

    await importProviderAvatar({ userId: USER_ID, url: GOOGLE_AVATAR });

    expect(storage.remove).toHaveBeenCalledWith([`${USER_ID}/provider-1700000000000.png`]);
  });

  it("returns null rather than failing the sign-in when the CDN errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ETIMEDOUT")));

    await expect(
      importProviderAvatar({ userId: USER_ID, url: GOOGLE_AVATAR }),
    ).resolves.toBeNull();
  });

  it("returns null rather than failing the sign-in when the bucket refuses the write", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(imageResponse()));
    storage.upload.mockResolvedValue({ error: { message: "row-level security" } });

    await expect(
      importProviderAvatar({ userId: USER_ID, url: GOOGLE_AVATAR }),
    ).resolves.toBeNull();
  });
});
