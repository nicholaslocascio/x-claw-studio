import { describe, expect, it } from "vitest";
import { hammingDistanceHex } from "@/src/server/media-fingerprint";
import {
  assetMatchesCandidateByUrl,
  mergeExistingMediaAssetState,
  resolveMediaAssetSyncUsageIds,
  shouldPromoteMediaAssetVideo,
  summarizeAnalyses
} from "@/src/server/media-assets";
import type { MediaAssetRecord, UsageAnalysis } from "@/src/lib/types";

function buildAnalysis(overrides: Partial<UsageAnalysis>): UsageAnalysis {
  const analysis: UsageAnalysis = {
    usageId: "usage-1",
    tweetId: "tweet-1",
    mediaIndex: 0,
    mediaKind: "image",
    status: "complete",
    has_celebrity: null,
    has_human_face: null,
    features_female: null,
    features_male: null,
    has_screenshot_ui: null,
    has_text_overlay: null,
    has_chart_or_graph: null,
    has_logo_or_watermark: null,
    caption_brief: null,
    scene_description: null,
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
    usage_notes: null,
    ...overrides
  };

  return {
    ...analysis,
    video_dialogue: analysis.video_dialogue ?? null
  };
}

function buildAsset(overrides: Partial<MediaAssetRecord>): MediaAssetRecord {
  return {
    assetId: "asset-1",
    canonicalMediaUrl: null,
    canonicalFilePath: null,
    promotedVideoSourceUrl: null,
    promotedVideoFilePath: null,
    mediaKind: "video_blob",
    fingerprint: null,
    similarityEmbedding: null,
    starred: false,
    usageIds: [],
    sourceUrls: [],
    previewUrls: [],
    posterUrls: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides
  };
}

describe("media fingerprint helpers", () => {
  it("computes hamming distance from two hex hashes", () => {
    expect(hammingDistanceHex("ffffffffffffffff", "ffffffffffffffff")).toBe(0);
    expect(hammingDistanceHex("ffffffffffffffff", "0000000000000000")).toBe(64);
  });
});

describe("summarizeAnalyses", () => {
  it("falls back to the first complete analysis when no aggregate exists", () => {
    const first = buildAnalysis({ usageId: "usage-a", conveys: "sarcastic approval" });
    const summary = summarizeAnalyses("asset-1", [first]);

    expect(summary.status).toBe("fallback_first_analysis");
    expect(summary.sourceUsageId).toBe("usage-a");
    expect(summary.summary?.conveys).toBe("sarcastic approval");
  });

  it("aggregates multiple complete analyses", () => {
    const first = buildAnalysis({
      usageId: "usage-a",
      conveys: "dread",
      user_intent: "signal urgency",
      primary_subjects: ["server rack"],
      primary_emotion: "anxiety"
    });
    const second = buildAnalysis({
      usageId: "usage-b",
      conveys: "dread",
      user_intent: "signal urgency",
      primary_subjects: ["operator"],
      metaphor: "machine panic",
      primary_emotion: "anxiety"
    });

    const summary = summarizeAnalyses("asset-2", [first, second]);

    expect(summary.status).toBe("aggregated");
    expect(summary.summary?.conveys).toBe("dread");
    expect(summary.summary?.user_intent).toBe("signal urgency");
    expect(summary.summary?.primary_subjects).toEqual(["server rack", "operator"]);
    expect(summary.summary?.primary_emotion).toBe("anxiety");
    expect(summary.summary?.metaphor).toBe("machine panic");
  });

  it("aggregates boolean labels with any-true semantics", () => {
    const first = buildAnalysis({
      usageId: "usage-a",
      has_screenshot_ui: true,
      has_chart_or_graph: false,
      features_female: true
    });
    const second = buildAnalysis({
      usageId: "usage-b",
      has_screenshot_ui: false,
      has_chart_or_graph: true,
      features_male: true
    });

    const summary = summarizeAnalyses("asset-3", [first, second]);

    expect(summary.summary?.has_screenshot_ui).toBe(true);
    expect(summary.summary?.has_chart_or_graph).toBe(true);
    expect(summary.summary?.has_celebrity).toBe(false);
    expect(summary.summary?.features_female).toBe(true);
    expect(summary.summary?.features_male).toBe(true);
  });
});

describe("shouldPromoteMediaAssetVideo", () => {
  it("promotes starred video assets even without duplicate matches", () => {
    expect(shouldPromoteMediaAssetVideo(buildAsset({ starred: true }), 1)).toBe(true);
  });

  it("promotes duplicate video assets when there are two matched usages", () => {
    expect(shouldPromoteMediaAssetVideo(buildAsset({ starred: false }), 2)).toBe(true);
  });

  it("does not promote non-video assets based on duplicate count alone", () => {
    expect(shouldPromoteMediaAssetVideo(buildAsset({ mediaKind: "image" }), 3)).toBe(false);
  });
});

describe("mergeExistingMediaAssetState", () => {
  it("preserves promoted video fields from an existing asset record", () => {
    const merged = mergeExistingMediaAssetState(
      buildAsset({
        assetId: "asset-video",
        promotedVideoSourceUrl: null,
        promotedVideoFilePath: null,
        createdAt: new Date(1000).toISOString()
      }),
      buildAsset({
        assetId: "asset-video",
        promotedVideoSourceUrl: "https://video.twimg.com/example.m3u8",
        promotedVideoFilePath: "data/analysis/media-assets/videos/asset-video.mp4",
        createdAt: new Date(0).toISOString()
      })
    );

    expect(merged.promotedVideoSourceUrl).toBe("https://video.twimg.com/example.m3u8");
    expect(merged.promotedVideoFilePath).toBe("data/analysis/media-assets/videos/asset-video.mp4");
    expect(merged.createdAt).toBe(new Date(0).toISOString());
  });
});

describe("assetMatchesCandidateByUrl", () => {
  it("matches existing assets by shared source url before fingerprint fallback", () => {
    const matched = assetMatchesCandidateByUrl(
      buildAsset({
        canonicalMediaUrl: "https://pbs.twimg.com/media/example.jpg",
        sourceUrls: ["https://pbs.twimg.com/media/example.jpg"],
        previewUrls: [],
        posterUrls: []
      }),
      ["https://pbs.twimg.com/media/example.jpg"],
      []
    );

    expect(matched).toBe(true);
  });

  it("matches videos by shared request key across source and poster urls", () => {
    const matched = assetMatchesCandidateByUrl(
      buildAsset({
        sourceUrls: ["https://video.twimg.com/amplify_video/1234567890/vid/avc1/1280x720/example.mp4"],
        previewUrls: [],
        posterUrls: []
      }),
      ["https://pbs.twimg.com/amplify_video_thumb/1234567890/img/example.jpg"],
      ["1234567890"]
    );

    expect(matched).toBe(true);
  });
});

describe("resolveMediaAssetSyncUsageIds", () => {
  it("processes only usages missing from the existing index during incremental sync", () => {
    const usageIds = resolveMediaAssetSyncUsageIds({
      usages: [{ usageId: "usage-a" }, { usageId: "usage-b" }, { usageId: "usage-c" }] as Array<{ usageId: string }>,
      existingUsageToAssetId: {
        "usage-a": "asset-1",
        "usage-b": "asset-missing"
      },
      existingAssetIds: ["asset-1"]
    });

    expect(usageIds).toEqual(["usage-b", "usage-c"]);
  });

  it("honors explicit usage ids for focused sync runs", () => {
    const usageIds = resolveMediaAssetSyncUsageIds({
      usages: [{ usageId: "usage-a" }, { usageId: "usage-b" }, { usageId: "usage-c" }] as Array<{ usageId: string }>,
      existingUsageToAssetId: {
        "usage-a": "asset-1"
      },
      existingAssetIds: ["asset-1"],
      requestedUsageIds: ["usage-c", "usage-a"]
    });

    expect(usageIds).toEqual(["usage-a", "usage-c"]);
  });
});
