import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtractedTweet, MediaAssetRecord, TweetUsageRecord, UsageAnalysis } from "@/src/lib/types";

const mockTweet: ExtractedTweet = {
  sourceName: "fixture",
  tweetId: "tweet-1",
  tweetUrl: null,
  authorHandle: "@tester",
  authorUsername: "@tester",
  authorDisplayName: "Tester",
  authorProfileImageUrl: null,
  createdAt: null,
  text: "test tweet",
  metrics: {
    replies: null,
    reposts: null,
    likes: null,
    bookmarks: null,
    views: null
  },
  media: [{ mediaKind: "video_blob", sourceUrl: null, previewUrl: null, posterUrl: null }],
  extraction: {
    articleIndex: 0,
    extractedAt: new Date(0).toISOString()
  }
};

const mockUsageAnalysis: UsageAnalysis = {
  usageId: "tweet-1-0",
  tweetId: "tweet-1",
  mediaIndex: 0,
  mediaKind: "video_blob",
  status: "complete",
  has_celebrity: false,
  has_human_face: true,
  features_female: false,
  features_male: true,
  has_screenshot_ui: false,
  has_text_overlay: false,
  has_chart_or_graph: false,
  has_logo_or_watermark: false,
  caption_brief: "brief",
  scene_description: "scene",
  ocr_text: null,
  primary_subjects: [],
  secondary_subjects: [],
  visible_objects: [],
  setting_context: null,
  action_or_event: null,
  video_music: null,
  video_sound: null,
  video_dialogue: null,
  video_action: null,
  primary_emotion: null,
  emotional_tone: null,
  conveys: null,
  user_intent: null,
  rhetorical_role: null,
  text_media_relationship: null,
  metaphor: null,
  humor_mechanism: null,
  cultural_reference: null,
  reference_entity: null,
  reference_source: null,
  reference_plot_context: null,
  analogy_target: null,
  analogy_scope: null,
  meme_format: null,
  persuasion_strategy: null,
  brand_signals: [],
  trend_signal: null,
  reuse_pattern: null,
  why_it_works: null,
  audience_takeaway: null,
  search_keywords: [],
  confidence_notes: null,
  usage_notes: null
};

const mockDashboardUsage: TweetUsageRecord = {
  usageId: "tweet-1-0",
  tweet: mockTweet,
  mediaIndex: 0,
  analysis: mockUsageAnalysis,
  mediaAssetId: "asset-1",
  mediaLocalFilePath: null,
  mediaPlayableFilePath: "data/analysis/media-assets/videos/asset-1.mp4",
  mediaAssetStarred: false,
  mediaAssetUsageCount: 1,
  phashMatchCount: 0,
  duplicateGroupId: "asset-1",
  duplicateGroupUsageCount: 1,
  hotnessScore: 0
};

const mockAsset: MediaAssetRecord = {
  assetId: "asset-1",
  canonicalMediaUrl: null,
  canonicalFilePath: null,
  promotedVideoSourceUrl: "https://video.twimg.com/example.mp4",
  promotedVideoFilePath: "data/analysis/media-assets/videos/asset-1.mp4",
  mediaKind: "video_blob",
  fingerprint: null,
  similarityEmbedding: null,
  starred: false,
  usageIds: ["tweet-1-0"],
  sourceUrls: [],
  previewUrls: [],
  posterUrls: [],
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString()
};

const analyzeTweetMediaUsage = vi.fn();
const analyzeTweetMediaUsageWithOptions = vi.fn();
const writeUsageAnalysis = vi.fn(() => "/tmp/analysis.json");
const indexUsageAnalysisInChroma = vi.fn(async () => ({ indexedCount: 1 }));
const syncFacetSearchAssetIndex = vi.fn(async () => ({ indexedCount: 1 }));
const readMediaAssetIndex = vi.fn();
const syncMediaAssetSummaries = vi.fn(() => ({
  file: { summaries: [] },
  touchedAssetIds: ["asset-1"],
  mode: "incremental"
}));
const getDashboardData = vi.fn();
const findTweetUsage = vi.fn();
const analyzeMediaAssetVideo = vi.fn(async () => null);
const assertVideoWithinAnalysisLimit = vi.fn(async () => undefined);

vi.mock("@/src/server/gemini-analysis", () => ({
  analyzeTweetMediaUsage,
  analyzeTweetMediaUsageWithOptions
}));

vi.mock("@/src/server/analysis-store", () => ({
  writeUsageAnalysis
}));

vi.mock("@/src/server/chroma-facets", () => ({
  indexUsageAnalysisInChroma,
  syncFacetSearchAssetIndex
}));

vi.mock("@/src/server/media-assets", () => ({
  readMediaAssetIndex,
  syncMediaAssetSummaries
}));

vi.mock("@/src/server/data", () => ({
  getDashboardData
}));

vi.mock("@/src/server/tweet-repository", () => ({
  findTweetUsage
}));

vi.mock("@/src/server/media-asset-video", () => ({
  analyzeMediaAssetVideo,
  assertVideoWithinAnalysisLimit
}));

describe("analyzeAndIndexTweetUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    findTweetUsage.mockReturnValue({ tweet: mockTweet, mediaIndex: 0 });
    getDashboardData.mockReturnValue({ tweetUsages: [mockDashboardUsage] });
    readMediaAssetIndex.mockReturnValue({
      assets: [mockAsset],
      usageToAssetId: { "tweet-1-0": "asset-1" }
    });
    analyzeTweetMediaUsage.mockResolvedValue(mockUsageAnalysis);
    analyzeTweetMediaUsageWithOptions.mockResolvedValue(mockUsageAnalysis);
  });

  it("prefers rerunning analysis over the promoted video when available", async () => {
    const { analyzeAndIndexTweetUsage } = await import("@/src/server/analysis-pipeline");

    await analyzeAndIndexTweetUsage("tweet-1", 0);

    expect(analyzeMediaAssetVideo).toHaveBeenCalledWith(mockAsset, mockDashboardUsage);
    expect(assertVideoWithinAnalysisLimit).toHaveBeenCalled();
    expect(analyzeTweetMediaUsageWithOptions).toHaveBeenCalledWith(
      mockTweet,
      expect.objectContaining({
        mediaIndex: 0,
        mediaSourceOverride: expect.stringContaining("data/analysis/media-assets/videos/asset-1.mp4")
      })
    );
    expect(analyzeTweetMediaUsage).not.toHaveBeenCalled();
  });

  it("falls back to image analysis when no promoted video is available", async () => {
    readMediaAssetIndex.mockReturnValue({
      assets: [{ ...mockAsset, promotedVideoFilePath: null }],
      usageToAssetId: { "tweet-1-0": "asset-1" }
    });

    const { analyzeAndIndexTweetUsage } = await import("@/src/server/analysis-pipeline");

    await analyzeAndIndexTweetUsage("tweet-1", 0);

    expect(analyzeMediaAssetVideo).not.toHaveBeenCalled();
    expect(assertVideoWithinAnalysisLimit).not.toHaveBeenCalled();
    expect(analyzeTweetMediaUsage).toHaveBeenCalledWith(mockTweet, 0);
    expect(analyzeTweetMediaUsageWithOptions).not.toHaveBeenCalled();
  });
});
