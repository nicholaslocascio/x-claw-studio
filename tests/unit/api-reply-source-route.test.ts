import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveReplySourceFromUrlMock = vi.fn();

vi.mock("@/src/server/reply-composer-subject", () => ({
  resolveReplySourceFromUrl: resolveReplySourceFromUrlMock
}));

describe("/api/reply/source", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the resolved tweet source payload", async () => {
    resolveReplySourceFromUrlMock.mockResolvedValue({
      normalizedUrl: "https://x.com/example/status/1",
      tweetId: "1",
      usageId: "tweet-1-0",
      source: "local",
      analysisStatus: "complete",
      subject: {
        usageId: "tweet-1-0",
        tweetId: "1",
        tweetUrl: "https://x.com/example/status/1",
        authorUsername: "example",
        createdAt: "2026-03-11T10:00:00.000Z",
        tweetText: "hello",
        mediaKind: "image",
        analysis: {
          captionBrief: "reaction",
          sceneDescription: "skeptical look",
          primaryEmotion: "skepticism",
          conveys: "disbelief",
          userIntent: "mock",
          rhetoricalRole: "reaction",
          textMediaRelationship: "echoes",
          culturalReference: null,
          analogyTarget: null,
          searchKeywords: ["skeptical"]
        }
      }
    });

    const { POST } = await import("@/app/api/reply/source/route");
    const response = await POST(
      new Request("http://localhost:4105/api/reply/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xUrl: "https://x.com/example/status/1" })
      })
    );

    expect(response.status).toBe(200);
    expect(resolveReplySourceFromUrlMock).toHaveBeenCalledWith({
      xUrl: "https://x.com/example/status/1"
    });
    await expect(response.json()).resolves.toMatchObject({
      tweetId: "1",
      usageId: "tweet-1-0",
      source: "local"
    });
  });

  it("returns 400 for an empty request body", async () => {
    const { POST } = await import("@/app/api/reply/source/route");
    const response = await POST(
      new Request("http://localhost:4105/api/reply/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xUrl: "" })
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "An X status URL is required"
    });
  });

  it("logs unexpected server errors before returning 500", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    resolveReplySourceFromUrlMock.mockRejectedValue(new Error("lookup exploded"));

    const { POST } = await import("@/app/api/reply/source/route");
    const response = await POST(
      new Request("http://localhost:4105/api/reply/source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xUrl: "https://x.com/example/status/1" })
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: "lookup exploded"
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[api:reply/source] POST /api/reply/source failed: lookup exploded",
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });
});
