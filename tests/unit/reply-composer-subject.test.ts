import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveReplyComposerSubject, resolveReplySourceFromUrl } from "@/src/server/reply-composer-subject";

const {
  getLightweightUsageDataMock,
  findTweetByIdMock,
  runXApiCaptureMock,
  queueMissingUsageAnalysisIfIdleMock
} = vi.hoisted(() => ({
  getLightweightUsageDataMock: vi.fn(),
  findTweetByIdMock: vi.fn(),
  runXApiCaptureMock: vi.fn(),
  queueMissingUsageAnalysisIfIdleMock: vi.fn()
}));

vi.mock("@/src/server/auto-analysis", () => ({
  queueMissingUsageAnalysisIfIdle: queueMissingUsageAnalysisIfIdleMock
}));

vi.mock("@/src/server/data", () => ({
  getLightweightUsageData: getLightweightUsageDataMock
}));

vi.mock("@/src/server/tweet-repository", () => ({
  findTweetById: findTweetByIdMock
}));

vi.mock("@/src/server/x-api-capture", () => ({
  runXApiCapture: runXApiCaptureMock
}));

describe("reply-composer-subject", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("reuses a local analyzed usage for a pasted X URL", async () => {
    getLightweightUsageDataMock.mockReturnValue([
      {
        usageId: "tweet-1-0",
        mediaIndex: 0,
        mediaLocalFilePath: "data/raw/tweet-1.jpg",
        mediaPlayableFilePath: null,
        tweet: {
          tweetId: "1",
          tweetUrl: "https://x.com/example/status/1",
          authorUsername: "example",
          createdAt: "2026-03-11T10:00:00.000Z",
          text: "hello",
          media: [{ mediaKind: "image" }]
        },
        analysis: {
          status: "complete",
          mediaKind: "image",
          caption_brief: "reaction",
          scene_description: "skeptical look",
          primary_emotion: "skepticism",
          conveys: "disbelief",
          user_intent: "mock the premise",
          rhetorical_role: "reaction",
          text_media_relationship: "echoes the tweet",
          cultural_reference: null,
          analogy_target: null,
          search_keywords: ["skeptical", "reaction"]
        }
      }
    ]);
    findTweetByIdMock.mockReturnValue({
      tweetId: "1",
      tweetUrl: "https://x.com/example/status/1",
      authorUsername: "example",
      createdAt: "2026-03-11T10:00:00.000Z",
      text: "hello",
      media: [{ mediaKind: "image" }]
    });

    const result = await resolveReplySourceFromUrl({
      xUrl: "https://twitter.com/example/status/1?t=abc"
    });

    expect(runXApiCaptureMock).not.toHaveBeenCalled();
    expect(result.normalizedUrl).toBe("https://x.com/example/status/1");
    expect(result.source).toBe("local");
    expect(result.usageId).toBe("tweet-1-0");
    expect(result.analysisStatus).toBe("complete");
    expect(result.subject.localFilePath).toBe("data/raw/tweet-1.jpg");
    expect(result.subject.analysis.primaryEmotion).toBe("skepticism");
  });

  it("captures from the X API when the pasted URL is missing locally", async () => {
    getLightweightUsageDataMock
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);
    findTweetByIdMock
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({
        tweetId: "99",
        tweetUrl: "https://x.com/example/status/99",
        authorUsername: "example",
        createdAt: "2026-03-11T10:00:00.000Z",
        text: "text-only tweet",
        media: []
      });

    const result = await resolveReplySourceFromUrl({
      xUrl: "https://x.com/example/status/99"
    });

    expect(runXApiCaptureMock).toHaveBeenCalledWith({
      mode: "tweet_lookup",
      tweetUrl: "https://x.com/example/status/99",
      postProcessMode: "deferred"
    });
    expect(result.source).toBe("x_api");
    expect(result.usageId).toBeNull();
    expect(result.analysisStatus).toBe("not_applicable");
    expect(result.subject.mediaKind).toBe("none");
  });

  it("returns a pending subject immediately and queues background analysis", async () => {
    getLightweightUsageDataMock.mockReturnValue([
      {
        usageId: "tweet-7-0",
        mediaIndex: 0,
        mediaLocalFilePath: "data/raw/tweet-7.jpg",
        mediaPlayableFilePath: null,
        tweet: {
          tweetId: "7",
          tweetUrl: "https://x.com/example/status/7",
          authorUsername: "example",
          createdAt: "2026-03-11T10:00:00.000Z",
          text: "pending analysis",
          media: [{ mediaKind: "image" }]
        },
        analysis: {
          status: "pending",
          mediaKind: "image",
          caption_brief: null,
          scene_description: null,
          primary_emotion: null,
          conveys: null,
          user_intent: null,
          rhetorical_role: null,
          text_media_relationship: null,
          cultural_reference: null,
          analogy_target: null,
          search_keywords: []
        }
      }
    ]);

    const subject = await resolveReplyComposerSubject({
      tweetId: "7",
      goal: "insight",
      mode: "single"
    });

    expect(queueMissingUsageAnalysisIfIdleMock).toHaveBeenCalledWith("reply composer for tweet-7-0");
    expect(subject.usageId).toBe("tweet-7-0");
    expect(subject.localFilePath).toBe("data/raw/tweet-7.jpg");
    expect(subject.analysis.primaryEmotion).toBeNull();
  });

  it("marks media tweets as pending when the source loads before analysis finishes", async () => {
    getLightweightUsageDataMock.mockReturnValue([
      {
        usageId: "tweet-8-0",
        mediaIndex: 0,
        mediaLocalFilePath: "data/raw/tweet-8.jpg",
        mediaPlayableFilePath: null,
        tweet: {
          tweetId: "8",
          tweetUrl: "https://x.com/example/status/8",
          authorUsername: "example",
          createdAt: "2026-03-11T10:00:00.000Z",
          text: "pending analysis",
          media: [{ mediaKind: "image" }]
        },
        analysis: {
          status: "pending",
          mediaKind: "image",
          caption_brief: null,
          scene_description: null,
          primary_emotion: null,
          conveys: null,
          user_intent: null,
          rhetorical_role: null,
          text_media_relationship: null,
          cultural_reference: null,
          analogy_target: null,
          search_keywords: []
        }
      }
    ]);
    findTweetByIdMock.mockReturnValue({
      tweetId: "8",
      tweetUrl: "https://x.com/example/status/8",
      authorUsername: "example",
      createdAt: "2026-03-11T10:00:00.000Z",
      text: "pending analysis",
      media: [{ mediaKind: "image" }]
    });

    const result = await resolveReplySourceFromUrl({
      xUrl: "https://x.com/example/status/8"
    });

    expect(result.analysisStatus).toBe("pending");
  });
});
