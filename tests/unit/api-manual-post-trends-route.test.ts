import { describe, expect, it, vi } from "vitest";

const buildTrendDigestBriefMock = vi.fn();

vi.mock("@/src/server/trend-post-brief", () => ({
  buildTrendDigestBrief: buildTrendDigestBriefMock
}));

describe("/api/manual-post/trends", () => {
  it("returns a generated trend brief", async () => {
    buildTrendDigestBriefMock.mockResolvedValue({
      briefText: "trend brief",
      generatedAt: "2026-03-18T18:00:00.000Z",
      timeframeHours: 48,
      topicCount: 6,
      tweetCount: 8,
      topics: [],
      tweets: []
    });

    const { GET } = await import("@/app/api/manual-post/trends/route");
    const response = await GET(
      new Request("http://localhost:4105/api/manual-post/trends?timeframeHours=48&maxTopics=6&maxTweets=8")
    );

    expect(buildTrendDigestBriefMock).toHaveBeenCalledWith({
      timeframeHours: 48,
      maxTopics: 6,
      maxTweets: 8
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      briefText: "trend brief",
      timeframeHours: 48
    });
  });
});
