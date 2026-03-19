import { beforeEach, describe, expect, it, vi } from "vitest";

const { getDashboardDataMock, analyzeAndIndexTweetUsageMock } = vi.hoisted(() => ({
  getDashboardDataMock: vi.fn(),
  analyzeAndIndexTweetUsageMock: vi.fn()
}));

vi.mock("@/src/server/data", () => ({
  getDashboardData: getDashboardDataMock
}));

vi.mock("@/src/server/analysis-pipeline", () => ({
  analyzeAndIndexTweetUsage: analyzeAndIndexTweetUsageMock
}));

describe("analyzeMissingUsages", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("processes missing usages newest-first", async () => {
    getDashboardDataMock.mockReturnValue({
      tweetUsages: [
        {
          usageId: "older",
          mediaIndex: 0,
          tweet: {
            tweetId: "1",
            createdAt: "2026-03-10T10:00:00.000Z",
            extraction: { extractedAt: "2026-03-10T10:05:00.000Z" }
          },
          analysis: { status: "pending" }
        },
        {
          usageId: "newer",
          mediaIndex: 0,
          tweet: {
            tweetId: "2",
            createdAt: "2026-03-12T10:00:00.000Z",
            extraction: { extractedAt: "2026-03-12T10:05:00.000Z" }
          },
          analysis: { status: "pending" }
        },
        {
          usageId: "done",
          mediaIndex: 0,
          tweet: {
            tweetId: "3",
            createdAt: "2026-03-13T10:00:00.000Z",
            extraction: { extractedAt: "2026-03-13T10:05:00.000Z" }
          },
          analysis: { status: "complete" }
        }
      ]
    });

    const { analyzeMissingUsages } = await import("@/src/server/analyze-missing");

    const result = await analyzeMissingUsages();

    expect(analyzeAndIndexTweetUsageMock.mock.calls).toEqual([
      ["2", 0],
      ["1", 0]
    ]);
    expect(result).toEqual({
      completed: 2,
      skipped: 0,
      failed: 0,
      totalMissing: 2
    });
  });

  it("falls back to extraction time when createdAt is missing", async () => {
    getDashboardDataMock.mockReturnValue({
      tweetUsages: [
        {
          usageId: "later-extracted",
          mediaIndex: 0,
          tweet: {
            tweetId: "10",
            createdAt: null,
            extraction: { extractedAt: "2026-03-12T11:00:00.000Z" }
          },
          analysis: { status: "pending" }
        },
        {
          usageId: "earlier-extracted",
          mediaIndex: 0,
          tweet: {
            tweetId: "11",
            createdAt: null,
            extraction: { extractedAt: "2026-03-12T09:00:00.000Z" }
          },
          analysis: { status: "pending" }
        }
      ]
    });

    const { analyzeMissingUsages } = await import("@/src/server/analyze-missing");

    await analyzeMissingUsages();

    expect(analyzeAndIndexTweetUsageMock.mock.calls).toEqual([
      ["10", 0],
      ["11", 0]
    ]);
  });
});
