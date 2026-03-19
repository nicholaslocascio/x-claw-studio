import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReplyCompositionDraft, ReplyCompositionPlan } from "@/src/lib/reply-composer";
import { composeReplyForUsage } from "@/src/server/reply-composer";

const {
  resolveReplyComposerSubjectMock,
  planReplyMock,
  composeReplyMock,
  searchManyMock,
  recordReplyMediaWishlistMock
} = vi.hoisted(() => ({
  resolveReplyComposerSubjectMock: vi.fn(),
  planReplyMock: vi.fn(),
  composeReplyMock: vi.fn(),
  searchManyMock: vi.fn(),
  recordReplyMediaWishlistMock: vi.fn()
}));

vi.mock("@/src/server/reply-composer-subject", () => ({
  resolveReplyComposerSubject: resolveReplyComposerSubjectMock
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

describe("composeReplyForUsage", () => {
  beforeEach(() => {
    resolveReplyComposerSubjectMock.mockReset();
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
    resolveReplyComposerSubjectMock.mockResolvedValue({
      usageId: "tweet-1-0",
      tweetId: "tweet-1",
      tweetUrl: "https://x.com/example/status/1",
      authorUsername: "example",
      createdAt: "2026-03-11T10:00:00.000Z",
      tweetText: "This pricing move was always the plan.",
      mediaKind: "image",
      localFilePath: "data/raw/tweet-1.jpg",
      playableFilePath: null,
      analysis: {
        captionBrief: "reaction image",
        sceneDescription: "A skeptical stare",
        primaryEmotion: "skepticism",
        conveys: "called-shot confidence",
        userIntent: "call out the strategy",
        rhetoricalRole: "reaction",
        textMediaRelationship: "sharpens the claim",
        culturalReference: null,
        analogyTarget: "platform pricing",
        searchKeywords: ["skeptical", "reaction"]
      }
    });
  });

  it("uses the shared subject resolver before composing a reply", async () => {
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

    expect(resolveReplyComposerSubjectMock).toHaveBeenCalledWith(
      {
        tweetId: "tweet-1",
        goal: "insight",
        mode: "single"
      },
      expect.any(Object)
    );
    expect(planReplyMock.mock.calls[0]?.[0].request.usageId).toBe("tweet-1-0");
    expect(planReplyMock.mock.calls[0]?.[0].subject.analysis.primaryEmotion).toBe("skepticism");
    expect(result.request.usageId).toBe("tweet-1-0");
    expect(progressEvents).toContain("starting");
  });

  it("falls back to tweet-only composition when the tweet has no media usage", async () => {
    resolveReplyComposerSubjectMock.mockResolvedValue({
      usageId: null,
      tweetId: "tweet-9",
      tweetUrl: "https://x.com/example/status/9",
      authorUsername: "example",
      createdAt: "2026-03-11T10:00:00.000Z",
      tweetText: "Text only",
      mediaKind: "none",
      localFilePath: null,
      playableFilePath: null,
      analysis: {
        captionBrief: null,
        sceneDescription: null,
        primaryEmotion: null,
        conveys: null,
        userIntent: null,
        rhetoricalRole: null,
        textMediaRelationship: null,
        culturalReference: null,
        analogyTarget: null,
        searchKeywords: []
      }
    });

    const result = await composeReplyForUsage({
      tweetId: "tweet-9",
      goal: "support",
      mode: "single"
    });

    expect(result.subject.usageId).toBeNull();
    expect(result.subject.mediaKind).toBe("none");
  });
});
