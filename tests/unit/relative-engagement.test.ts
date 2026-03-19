import { describe, expect, it } from "vitest";
import { classifyRelativeEngagementBand, computeRelativeEngagementScore } from "@/src/server/relative-engagement";

describe("computeRelativeEngagementScore", () => {
  it("returns null when follower counts are missing", () => {
    expect(
      computeRelativeEngagementScore({
        tweet: {
          authorFollowerCount: null,
          createdAt: "2026-03-18T12:00:00.000Z",
          metrics: {
            replies: "10",
            reposts: "20",
            likes: "100",
            bookmarks: "5",
            views: "1000"
          },
          extraction: {
            articleIndex: 0,
            extractedAt: "2026-03-18T12:05:00.000Z"
          }
        },
        nowMs: Date.parse("2026-03-18T18:00:00.000Z")
      })
    ).toBeNull();
  });

  it("rewards denser engagement from smaller accounts", () => {
    const smallAccountScore = computeRelativeEngagementScore({
      tweet: {
        authorFollowerCount: 2000,
        createdAt: "2026-03-18T12:00:00.000Z",
        metrics: {
          replies: "40",
          reposts: "80",
          likes: "900",
          bookmarks: "120",
          views: "20000"
        },
        extraction: {
          articleIndex: 0,
          extractedAt: "2026-03-18T12:05:00.000Z"
        }
      },
      nowMs: Date.parse("2026-03-18T18:00:00.000Z")
    });
    const largeAccountScore = computeRelativeEngagementScore({
      tweet: {
        authorFollowerCount: 200000,
        createdAt: "2026-03-18T12:00:00.000Z",
        metrics: {
          replies: "40",
          reposts: "80",
          likes: "900",
          bookmarks: "120",
          views: "20000"
        },
        extraction: {
          articleIndex: 0,
          extractedAt: "2026-03-18T12:05:00.000Z"
        }
      },
      nowMs: Date.parse("2026-03-18T18:00:00.000Z")
    });

    expect(smallAccountScore).not.toBeNull();
    expect(largeAccountScore).not.toBeNull();
    expect(smallAccountScore!).toBeGreaterThan(largeAccountScore!);
    expect(classifyRelativeEngagementBand(smallAccountScore)).toBe("breakout");
    expect(classifyRelativeEngagementBand(largeAccountScore)).toBe("baseline");
  });
});
