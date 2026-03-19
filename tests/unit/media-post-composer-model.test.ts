import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiCliMediaPostComposerModel } from "@/src/server/media-post-composer-model";
import type { MediaPostRequest, MediaPostSubject } from "@/src/lib/media-post-composer";

const { runComposePromptWithProviderMock } = vi.hoisted(() => ({
  runComposePromptWithProviderMock: vi.fn()
}));

vi.mock("@/src/server/compose-model-cli", async () => {
  const actual = await vi.importActual<typeof import("@/src/server/compose-model-cli")>("@/src/server/compose-model-cli");

  return {
    ...actual,
    runComposePromptWithProvider: runComposePromptWithProviderMock
  };
});

const request: MediaPostRequest = {
  usageId: "usage-1",
  toneHint: "dry",
  angleHint: "make the hardware point",
  constraints: "keep it short"
};

const subject: MediaPostSubject = {
  usageId: "usage-1",
  tweetId: "tweet-1",
  assetId: "asset-1",
  assetUsageCount: 3,
  mediaKind: "image",
  authorUsername: "example",
  createdAt: "2026-03-11T17:00:00.000Z",
  tweetText: "Look at this tiny box.",
  localFilePath: "data/example.jpg",
  playableFilePath: null,
  analysis: {
    captionBrief: "Tiny hardware on a desk",
    sceneDescription: "A palm-sized device beside a bottle cap",
    primaryEmotion: "curiosity",
    emotionalTone: "dry",
    conveys: "small hardware can do real work",
    userIntent: "show a tiny computer",
    rhetoricalRole: "evidence",
    textMediaRelationship: "grounds the claim",
    culturalReference: null,
    analogyTarget: null,
    trendSignal: "local-first hardware",
    audienceTakeaway: "consumer gear can handle more than expected",
    brandSignals: ["DIY"],
    searchKeywords: ["tiny computer", "maker device"]
  },
  relatedTopics: [],
  priorUsages: []
};

describe("GeminiCliMediaPostComposerModel", () => {
  beforeEach(() => {
    runComposePromptWithProviderMock.mockReset();
  });

  it("runs a cleanup pass before returning the media-led draft", async () => {
    runComposePromptWithProviderMock
      .mockResolvedValueOnce(
        JSON.stringify({
          response: JSON.stringify({
            tweetText: "This bottlecap computer isn’t cute—it’s a receipt for infra bloat.",
            selectedCandidateId: "candidate-9",
            mediaSelectionReason: "The visual makes the hardware point instantly.",
            whyThisTweetWorks: "It turns the asset into an argument about efficiency.",
            postingNotes: null
          })
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          response: JSON.stringify({
            tweetText: "This bottlecap computer isn't cute-it's a receipt for infra bloat.",
            selectedCandidateId: null,
            mediaSelectionReason: "The visual makes the hardware point instantly.",
            whyThisTweetWorks: "It turns the asset into an argument about efficiency.",
            postingNotes: null
          })
        })
      );

    const model = new GeminiCliMediaPostComposerModel();
    const draft = await model.composePost({
      request,
      subject,
      plan: {
        angle: "Tiny hardware makes the bloated-server story look optional.",
        tone: "dry",
        postIntent: "Connect the image to the current edge-compute moment.",
        targetReaction: "Readers should question why inference stacks are so bloated.",
        searchQueries: ["tiny computer", "server rack"],
        candidateSelectionCriteria: ["supports the edge-compute point", "stays grounded"],
        supportingTopics: ["Edge AI"],
        avoid: ["generic future talk"]
      },
      candidates: []
    });

    expect(runComposePromptWithProviderMock).toHaveBeenCalledTimes(2);
    expect(runComposePromptWithProviderMock.mock.calls[1]?.[1]?.prompt).toContain("cleaning a generated media-led X post");
    expect(draft.selectedCandidateId).toBe("candidate-9");
    expect(draft.tweetText).toBe("This bottlecap computer isn't cute-it's a receipt for infra bloat.");
  });
});
