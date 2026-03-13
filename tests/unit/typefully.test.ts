import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("typefully helpers", () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.TYPEFULLY_API_KEY;
  const originalSocialSetId = process.env.TYPEFULLY_SOCIAL_SET_ID;

  beforeEach(() => {
    process.env.TYPEFULLY_API_KEY = "test-typefully-key";
    process.env.TYPEFULLY_SOCIAL_SET_ID = "289724";
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.TYPEFULLY_API_KEY;
    } else {
      process.env.TYPEFULLY_API_KEY = originalApiKey;
    }

    if (originalSocialSetId === undefined) {
      delete process.env.TYPEFULLY_SOCIAL_SET_ID;
    } else {
      process.env.TYPEFULLY_SOCIAL_SET_ID = originalSocialSetId;
    }
  });

  it("maps social set list and detail responses into UI-friendly records", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                id: 289724,
                username: "nick_locascio_",
                name: "nick",
                profile_image_url: "https://example.com/main.jpeg"
              }
            ]
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 289724,
            username: "nick_locascio_",
            name: "nick",
            profile_image_url: "https://example.com/main.jpeg",
            platforms: {
              x: {
                username: "nick_locascio_",
                name: "nick",
                profile_url: "https://x.com/nick_locascio_"
              }
            }
          }),
          { status: 200 }
        )
      );

    global.fetch = fetchMock as unknown as typeof fetch;

    const { listTypefullySocialSets } = await import("@/src/server/typefully");
    const result = await listTypefullySocialSets();

    expect(result).toEqual([
      {
        id: 289724,
        username: "nick_locascio_",
        name: "nick",
        profileImageUrl: "https://example.com/main.jpeg",
        xUsername: "nick_locascio_",
        xName: "nick",
        xProfileUrl: "https://x.com/nick_locascio_"
      }
    ]);
  });

  it("creates a reply draft with uploaded media and reply_to_url", async () => {
    const fileBuffer = Buffer.from("fake image bytes");
    const { tmpdir } = await import("node:os");
    const filePath = `${tmpdir()}/typefully-test-image.jpg`;
    const { writeFileSync, unlinkSync } = await import("node:fs");
    writeFileSync(filePath, fileBuffer);

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/media/upload")) {
        return new Response(
          JSON.stringify({
            media_id: "media-123",
            upload_url: "https://upload.example.com/media-123"
          }),
          { status: 200 }
        );
      }

      if (url === "https://upload.example.com/media-123") {
        expect(init?.method).toBe("PUT");
        expect(init?.body).toBeInstanceOf(Buffer);
        return new Response(null, { status: 200 });
      }

      if (url.endsWith("/media/media-123")) {
        return new Response(
          JSON.stringify({
            media_id: "media-123",
            status: "ready"
          }),
          { status: 200 }
        );
      }

      if (url.endsWith("/drafts")) {
        const body = JSON.parse(String(init?.body));
        expect(body.platforms.x.posts[0].media_ids).toEqual(["media-123"]);
        expect(body.platforms.x.settings.reply_to_url).toBe("https://x.com/example/status/1234567890");
        return new Response(
          JSON.stringify({
            id: 555,
            social_set_id: 289724,
            status: "draft",
            preview: "reply preview",
            private_url: "https://typefully.com/?d=555&a=289724",
            share_url: null
          }),
          { status: 200 }
        );
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const { createTypefullyDraft } = await import("@/src/server/typefully");
    const result = await createTypefullyDraft({
      mode: "reply",
      text: "This is a reply",
      mediaFilePath: filePath,
      replyToTweetUrl: "https://x.com/example/status/1234567890"
    });

    expect(result.typefullyDraftId).toBe(555);
    expect(result.mediaId).toBe("media-123");
    expect(result.privateUrl).toBe("https://typefully.com/?d=555&a=289724");

    unlinkSync(filePath);
  });

  it("creates a quote draft with quote_post_url", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/drafts")) {
        const body = JSON.parse(String(init?.body));
        expect(body.platforms.x.posts[0].quote_post_url).toBe("https://x.com/example/status/2025894220243063023");
        expect(body.platforms.x.settings.reply_to_url).toBeUndefined();
        return new Response(
          JSON.stringify({
            id: 777,
            social_set_id: 289724,
            status: "draft",
            preview: "quote preview",
            private_url: "https://typefully.com/?d=777&a=289724",
            share_url: null
          }),
          { status: 200 }
        );
      }

      throw new Error(`Unexpected fetch call: ${url}`);
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    const { createTypefullyDraft } = await import("@/src/server/typefully");
    const result = await createTypefullyDraft({
      mode: "quote_post",
      text: "My thoughts on this",
      replyToTweetUrl: "https://x.com/example/status/2025894220243063023"
    });

    expect(result.typefullyDraftId).toBe(777);
    expect(result.mediaId).toBeNull();
    expect(result.privateUrl).toBe("https://typefully.com/?d=777&a=289724");
  });
});
