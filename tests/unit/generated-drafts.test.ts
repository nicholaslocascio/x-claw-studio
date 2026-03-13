import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createGeneratedDraft,
  listGeneratedDrafts,
  markGeneratedDraftComplete,
  markGeneratedDraftOutputPosted,
  markGeneratedDraftOutputSavedToTypefully
} from "@/src/server/generated-drafts";
import type { MediaPostResult } from "@/src/lib/media-post-composer";

const generatedDraftsPath = path.join(process.cwd(), "data", "analysis", "generated-drafts", "index.json");
let originalDraftsContent: string | null = null;

describe("generated-drafts posting state", () => {
  beforeEach(() => {
    originalDraftsContent = fs.existsSync(generatedDraftsPath) ? fs.readFileSync(generatedDraftsPath, "utf8") : null;
    fs.mkdirSync(path.dirname(generatedDraftsPath), { recursive: true });
    fs.writeFileSync(generatedDraftsPath, "[]");
  });

  afterEach(() => {
    if (originalDraftsContent === null) {
      try {
        fs.unlinkSync(generatedDraftsPath);
      } catch {}
      return;
    }

    fs.writeFileSync(generatedDraftsPath, originalDraftsContent);
  });

  it("stores the current asset paths for media drafts that keep the source asset", () => {
    const draft = createGeneratedDraft({
      kind: "media_post",
      usageId: "usage-1",
      assetId: "asset-1"
    });

    const result: MediaPostResult = {
      provider: "test",
      request: {
        usageId: "usage-1"
      },
      subject: {
        usageId: "usage-1",
        tweetId: "tweet-1",
        assetId: "asset-1",
        assetUsageCount: 2,
        mediaKind: "image",
        authorUsername: "nick",
        createdAt: "2026-03-12T12:00:00.000Z",
        tweetText: "source tweet",
        localFilePath: "data/raw/example.jpg",
        playableFilePath: "data/raw/example.mp4",
        analysis: {
          captionBrief: null,
          sceneDescription: null,
          primaryEmotion: null,
          emotionalTone: null,
          conveys: null,
          userIntent: null,
          rhetoricalRole: null,
          textMediaRelationship: null,
          culturalReference: null,
          analogyTarget: null,
          trendSignal: null,
          audienceTakeaway: null,
          brandSignals: [],
          searchKeywords: []
        },
        relatedTopics: [],
        priorUsages: []
      },
      plan: {
        angle: "angle",
        tone: "tone",
        postIntent: "intent",
        targetReaction: "reaction",
        searchQueries: ["one", "two"],
        candidateSelectionCriteria: ["fit", "clarity"],
        supportingTopics: [],
        avoid: []
      },
      tweet: {
        text: "final draft",
        mediaSelectionReason: "Keep the current asset",
        whyThisTweetWorks: "It matches the asset",
        postingNotes: null
      },
      search: {
        provider: "test-search",
        queries: ["one", "two"],
        resultCount: 0,
        warning: null
      },
      selectedMedia: null,
      alternativeMedia: []
    };

    markGeneratedDraftComplete({
      draftId: draft.draftId,
      kind: "media_post",
      result
    });

    const [savedDraft] = listGeneratedDrafts({ kind: "media_post", usageId: "usage-1", limit: 1 });
    expect(savedDraft.outputs[0]?.selectedMediaLocalFilePath).toBe("data/raw/example.jpg");
    expect(savedDraft.outputs[0]?.selectedMediaVideoFilePath).toBe("data/raw/example.mp4");
    expect(savedDraft.outputs[0]?.selectedMediaAssetId).toBe("asset-1");
  });

  it("marks a specific draft output as posted", () => {
    const draft = createGeneratedDraft({
      kind: "topic_post",
      topicId: "topic-1"
    });

    fs.writeFileSync(
      generatedDraftsPath,
      JSON.stringify([
        {
          ...draft,
          status: "complete",
          outputs: [
            {
              goal: "insight",
              text: "draft body",
              whyThisWorks: "because",
              mediaSelectionReason: null,
              postingNotes: null,
              selectedMediaLabel: null,
              selectedMediaSourceType: null,
              postedToXAt: null,
              postedToXUrl: null,
              postedToXError: null
            }
          ]
        }
      ])
    );

    markGeneratedDraftOutputPosted({
      draftId: draft.draftId,
      outputIndex: 0,
      postedAt: "2026-03-12T15:00:00.000Z",
      postedToXUrl: "https://x.com/home"
    });

    const [savedDraft] = listGeneratedDrafts({ kind: "topic_post", topicId: "topic-1", limit: 1 });
    expect(savedDraft.outputs[0]?.postedToXAt).toBe("2026-03-12T15:00:00.000Z");
    expect(savedDraft.outputs[0]?.postedToXUrl).toBe("https://x.com/home");
    expect(savedDraft.outputs[0]?.postedToXError).toBeNull();
  });

  it("stores Typefully draft metadata on a saved output", () => {
    const draft = createGeneratedDraft({
      kind: "reply",
      tweetId: "tweet-1"
    });

    fs.writeFileSync(
      generatedDraftsPath,
      JSON.stringify([
        {
          ...draft,
          status: "complete",
          outputs: [
            {
              goal: "insight",
              text: "reply body",
              whyThisWorks: "because",
              mediaSelectionReason: null,
              postingNotes: null,
              selectedMediaLabel: null,
              selectedMediaSourceType: null,
              postedToXAt: null,
              postedToXUrl: null,
              postedToXError: null,
              typefullySavedAt: null,
              typefullyDraftId: null,
              typefullyStatus: null,
              typefullyPrivateUrl: null,
              typefullyShareUrl: null,
              typefullyError: null
            }
          ]
        }
      ])
    );

    markGeneratedDraftOutputSavedToTypefully({
      draftId: draft.draftId,
      outputIndex: 0,
      savedAt: "2026-03-12T16:00:00.000Z",
      typefullyDraftId: 12345,
      typefullyStatus: "draft",
      typefullyPrivateUrl: "https://typefully.com/?d=12345&a=67890",
      typefullyShareUrl: null
    });

    const [savedDraft] = listGeneratedDrafts({ kind: "reply", tweetId: "tweet-1", limit: 1 });
    expect(savedDraft.outputs[0]?.typefullySavedAt).toBe("2026-03-12T16:00:00.000Z");
    expect(savedDraft.outputs[0]?.typefullyDraftId).toBe(12345);
    expect(savedDraft.outputs[0]?.typefullyStatus).toBe("draft");
    expect(savedDraft.outputs[0]?.typefullyPrivateUrl).toBe("https://typefully.com/?d=12345&a=67890");
    expect(savedDraft.outputs[0]?.typefullyError).toBeNull();
  });
});
