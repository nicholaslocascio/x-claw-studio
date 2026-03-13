import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReplyCompositionDraft, ReplyCompositionPlan } from "@/src/lib/reply-composer";
import { composeReplyForUsage } from "@/src/server/reply-composer";

const {
  analyzeAndIndexTweetUsageMock,
  getDashboardDataMock,
  getUsageDetailMock,
  findTweetByIdMock,
  planReplyMock,
  composeReplyMock,
  searchManyMock,
  recordReplyMediaWishlistMock
} = vi.hoisted(() => ({
  analyzeAndIndexTweetUsageMock: vi.fn(),
  getDashboardDataMock: vi.fn(),
  getUsageDetailMock: vi.fn(),
  findTweetByIdMock: vi.fn(),
  planReplyMock: vi.fn(),
  composeReplyMock: vi.fn(),
  searchManyMock: vi.fn(),
  recordReplyMediaWishlistMock: vi.fn()
}));

vi.mock("@/src/server/analysis-pipeline", () => ({
  analyzeAndIndexTweetUsage: analyzeAndIndexTweetUsageMock
}));

vi.mock("@/src/server/data", () => ({
  getDashboardData: getDashboardDataMock
}));

vi.mock("@/src/server/usage-details", () => ({
  getUsageDetail: getUsageDetailMock
}));

vi.mock("@/src/server/tweet-repository", () => ({
  findTweetById: findTweetByIdMock
}));

vi.mock("@/src/server/reply-composer-model", () => ({
  createReplyComposerModel: () => ({
    providerId: "test-model",
    planReply: planReplyMock,
    composeReply: composeReplyMock
  })
}));

vi.mock("@/src/server/reply-media-search", () => ({
  CliFacetReplyMediaSearchProvider: class {
    providerId = "test-search";

    searchMany = searchManyMock;
  }
}));

vi.mock("@/src/server/reply-media-wishlist", () => ({
  recordReplyMediaWishlist: recordReplyMediaWishlistMock
}));

const plan: ReplyCompositionPlan = {
  stance: "agree",
  angle: "Add a sharper implication",
  tone: "dry",
  intentSummary: "Extend the point",
  targetEffect: "Make the consequence feel obvious",
  searchQueries: ["grim nod", "reaction image"],
  moodKeywords: ["dry", "knowing"],
  candidateSelectionCriteria: ["fits the angle", "stays legible"],
  avoid: ["generic hype"]
};

const draft: ReplyCompositionDraft = {
  replyText: "This is the part everyone pretends is a side effect.",
  selectedCandidateId: "candidate-1",
  mediaSelectionReason: "The reaction image lands the same implication.",
  whyThisReplyWorks: "It adds a sharper consequence without repeating the tweet.",
  postingNotes: null
};

const analyzedUsageDetail = {
  usageId: "tweet-1-0",
  mediaIndex: 0,
  tweet: {
    tweetId: "tweet-1",
    tweetUrl: "https://x.com/example/status/1",
    authorUsername: "example",
    createdAt: "2026-03-11T10:00:00.000Z",
    text: "This pricing move was always the plan.",
    media: [{ mediaKind: "image" }]
  },
  analysis: {
    mediaKind: "image",
    caption_brief: "reaction image",
    scene_description: "A skeptical stare",
    primary_emotion: "skepticism",
    conveys: "called-shot confidence",
    user_intent: "call out the strategy",
    rhetorical_role: "reaction",
    text_media_relationship: "sharpens the claim",
    cultural_reference: null,
    analogy_target: "platform pricing",
    search_keywords: ["skeptical", "reaction"]
  }
};

describe("composeReplyForUsage", () => {
  beforeEach(() => {
    analyzeAndIndexTweetUsageMock.mockReset();
    getDashboardDataMock.mockReset();
    getUsageDetailMock.mockReset();
    findTweetByIdMock.mockReset();
    planReplyMock.mockReset();
    composeReplyMock.mockReset();
    searchManyMock.mockReset();
    recordReplyMediaWishlistMock.mockReset();

    planReplyMock.mockResolvedValue(plan);
    composeReplyMock.mockResolvedValue(draft);
    searchManyMock.mockResolvedValue({
      candidates: [
        {
          candidateId: "candidate-1",
          usageId: "other-usage-1",
          assetId: "asset-1",
          tweetId: "tweet-2",
          tweetUrl: "https://x.com/example/status/2",
          authorUsername: "other",
          createdAt: "2026-03-11T11:00:00.000Z",
          tweetText: "Other tweet",
          displayUrl: null,
          localFilePath: null,
          videoFilePath: null,
          mediaKind: "image",
          combinedScore: 0.92,
          matchReason: "same mood",
          sourceType: "usage_facet",
          sourceLabel: "other tweet",
          analysis: null
        }
      ],
      warning: null
    });
    recordReplyMediaWishlistMock.mockReturnValue([]);
  });

  it("analyzes the first media usage before composing a tweet-led reply when analysis is missing", async () => {
    getDashboardDataMock.mockReturnValue({
      tweetUsages: [
        {
          usageId: "tweet-1-0",
          mediaIndex: 0,
          tweet: {
            tweetId: "tweet-1",
            tweetUrl: "https://x.com/example/status/1",
            authorUsername: "example",
            createdAt: "2026-03-11T10:00:00.000Z",
            text: "This pricing move was always the plan.",
            media: [{ mediaKind: "image" }]
          },
          analysis: {
            status: "pending"
          }
        }
      ]
    });
    getUsageDetailMock.mockResolvedValue(analyzedUsageDetail);

    const progressEvents: string[] = [];
    const result = await composeReplyForUsage(
      {
        tweetId: "tweet-1",
        goal: "insight",
        mode: "single"
      },
      {
        onProgress(event) {
          progressEvents.push(event.stage);
        }
      }
    );

    expect(analyzeAndIndexTweetUsageMock).toHaveBeenCalledWith("tweet-1", 0);
    expect(getUsageDetailMock).toHaveBeenCalledWith("tweet-1-0");
    expect(planReplyMock.mock.calls[0]?.[0].request.usageId).toBe("tweet-1-0");
    expect(planReplyMock.mock.calls[0]?.[0].subject.analysis.primaryEmotion).toBe("skepticism");
    expect(result.request.usageId).toBe("tweet-1-0");
    expect(progressEvents).toContain("analyzing");
  });

  it("falls back to tweet-only composition when the tweet has no media usage", async () => {
    getDashboardDataMock.mockReturnValue({
      tweetUsages: []
    });
    findTweetByIdMock.mockReturnValue({
      tweetId: "tweet-9",
      tweetUrl: "https://x.com/example/status/9",
      authorUsername: "example",
      createdAt: "2026-03-11T10:00:00.000Z",
      text: "Text only",
      sourceName: "x",
      media: []
    });

    const result = await composeReplyForUsage({
      tweetId: "tweet-9",
      goal: "support",
      mode: "single"
    });

    expect(analyzeAndIndexTweetUsageMock).not.toHaveBeenCalled();
    expect(result.subject.usageId).toBeNull();
    expect(result.subject.mediaKind).toBe("none");
  });
});
