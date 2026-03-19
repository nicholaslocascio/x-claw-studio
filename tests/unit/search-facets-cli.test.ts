import { describe, expect, it } from "vitest";
import type { HybridSearchResult } from "@/src/server/chroma-facets";
import type { TweetUsageRecord, UsageAnalysis } from "@/src/lib/types";
import { buildAgentFacetSearchPayload, parseSearchFacetCliArgs } from "@/src/cli/search-facets";

function createAnalysis(): UsageAnalysis {
  return {
    usageId: "usage-1",
    tweetId: "tweet-1",
    mediaIndex: 0,
    mediaKind: "image",
    status: "complete",
    has_celebrity: false,
    has_human_face: true,
    features_female: false,
    features_male: true,
    has_screenshot_ui: true,
    has_text_overlay: false,
    has_chart_or_graph: true,
    has_logo_or_watermark: false,
    caption_brief: "Terminal dashboard capture",
    scene_description: "Operators reviewing a dashboard.",
    ocr_text: "ALERT MODE",
    primary_subjects: ["operator"],
    secondary_subjects: ["dashboard"],
    visible_objects: ["monitor"],
    setting_context: "trading desk",
    action_or_event: "monitoring",
    video_music: null,
    video_sound: null,
    video_dialogue: null,
    video_action: null,
    primary_emotion: "focus",
    emotional_tone: "analytical",
    conveys: "competence under pressure",
    user_intent: "show proof",
    rhetorical_role: "evidence",
    text_media_relationship: "reinforces the claim",
    metaphor: null,
    humor_mechanism: null,
    cultural_reference: null,
    reference_entity: null,
    reference_source: null,
    reference_plot_context: null,
    analogy_target: null,
    analogy_scope: null,
    meme_format: null,
    persuasion_strategy: "clarity",
    brand_signals: [],
    trend_signal: "market ops",
    reuse_pattern: "dashboard reuse",
    why_it_works: "dense proof",
    audience_takeaway: "the dashboard is active",
    search_keywords: ["dashboard", "terminal"],
    confidence_notes: "fixture",
    usage_notes: "fixture"
  };
}

function createUsage(): TweetUsageRecord {
  const analysis = createAnalysis();

  return {
    usageId: analysis.usageId,
    tweet: {
      sourceName: "fixture",
      tweetId: "tweet-1",
      tweetUrl: "https://x.com/example/status/1",
      authorHandle: "@example",
      authorUsername: "example",
      authorDisplayName: "Example",
      authorProfileImageUrl: null,
      createdAt: "2026-03-10T12:00:00.000Z",
      text: "Terminal dashboard screenshot",
      metrics: { replies: null, reposts: null, likes: null, bookmarks: null, views: null },
      media: [
        {
          mediaKind: "image",
          sourceUrl: "https://pbs.twimg.com/media/source.jpg",
          previewUrl: "https://pbs.twimg.com/media/preview.jpg",
          posterUrl: null
        }
      ],
      extraction: { articleIndex: 0, extractedAt: "2026-03-10T12:00:00.000Z" }
    },
    mediaIndex: 0,
    analysis,
    mediaAssetId: "asset-1",
    mediaLocalFilePath: "/tmp/source.jpg",
    mediaPlayableFilePath: null,
    mediaAssetStarred: true,
    mediaAssetUsageCount: 3,
    phashMatchCount: 0,
    duplicateGroupId: "dup-1",
    duplicateGroupUsageCount: 2,
    hotnessScore: 0.75
  };
}

describe("parseSearchFacetCliArgs", () => {
  it("accepts flag-based arguments", () => {
    expect(
      parseSearchFacetCliArgs(["--query", "dashboard", "--facet", "conveys", "--limit", "5", "--jsonl"])
    ).toMatchObject({
      query: "dashboard",
      facetName: "conveys",
      limit: 5,
      format: "jsonl",
      highQualityOnly: true,
      allFacetsMode: "combined_blob",
      hardMatchMode: "off"
    });
  });

  it("accepts legacy positional arguments", () => {
    expect(parseSearchFacetCliArgs(["dashboard", "conveys"])).toMatchObject({
      query: "dashboard",
      facetName: "conveys",
      limit: 20,
      format: "json",
      highQualityOnly: true,
      allFacetsMode: "combined_blob",
      hardMatchMode: "off"
    });
  });

  it("accepts video-only and all-results flags", () => {
    expect(parseSearchFacetCliArgs(["--query", "reaction", "--video-only", "--all"])).toMatchObject({
      mediaKinds: ["video", "video_hls", "video_blob"],
      highQualityOnly: false
    });
  });

  it("accepts the combined all-facets mode", () => {
    expect(parseSearchFacetCliArgs(["--query", "reaction", "--all-facets-mode", "combined_blob"])).toMatchObject({
      allFacetsMode: "combined_blob"
    });
  });

  it("accepts an explicit hard-match mode", () => {
    expect(parseSearchFacetCliArgs(["--query", "celebrity", "--hard-match-mode", "intent"])).toMatchObject({
      hardMatchMode: "intent"
    });
  });
});

describe("buildAgentFacetSearchPayload", () => {
  it("emits an enriched agent-facing payload", () => {
    const usage = createUsage();
    const result: HybridSearchResult = {
      query: "dashboard",
      facetName: "conveys",
      limit: 5,
      vectorStatus: "ok",
      warningMessage: null,
      filters: {
        mediaKinds: null,
        highQualityOnly: true,
        allFacetsMode: "combined_blob",
        hardMatchMode: "off"
      },
      results: [
        {
          id: "usage-1::conveys",
          document: "facet_name: conveys\nfacet_value: competence under pressure",
          metadata: {
            usage_id: "usage-1",
            tweet_id: "tweet-1",
            facet_name: "conveys",
            facet_description: "The social or emotional message the post communicates through the media.",
            facet_value: "competence under pressure",
            media_index: 0,
            media_kind: "image"
          },
          media: {
            mediaAssetId: "asset-1",
            mediaLocalFilePath: "/tmp/source.jpg",
            mediaPlayableFilePath: null,
            sourceUrl: "https://pbs.twimg.com/media/source.jpg",
            previewUrl: "https://pbs.twimg.com/media/preview.jpg",
            posterUrl: null,
            tweetUrl: "https://x.com/example/status/1",
            tweetText: "Terminal dashboard screenshot",
            authorHandle: "@example",
            authorUsername: "example",
            authorDisplayName: "Example",
            createdAt: "2026-03-10T12:00:00.000Z",
            mediaIndex: 0,
            duplicateGroupId: "dup-1",
            duplicateGroupUsageCount: 2,
            hotnessScore: 0.75,
            mediaAssetStarred: true,
            mediaAssetUsageCount: 3,
            phashMatchCount: 0
          },
          vectorDistance: 0.2,
          vectorScore: 0.9,
          lexicalScore: 0.7,
          combinedScore: 0.83,
          matchedBy: ["vector", "lexical"]
        }
      ]
    };

    const payload = buildAgentFacetSearchPayload(result, new Map([[usage.usageId, usage]]));

    expect(payload).toMatchObject({
      command: "search-facets",
      query: "dashboard",
      result_count: 1,
      filters: {
        mediaKinds: null,
        highQualityOnly: true,
        allFacetsMode: "combined_blob",
        hardMatchMode: "off"
      },
      facet: {
        name: "conveys"
      }
    });
    expect(payload.results[0]).toMatchObject({
      result_id: "usage-1::conveys",
      matched_facet: {
        name: "conveys",
        value: "competence under pressure"
      },
      usage: {
        usage_id: "usage-1",
        tweet_id: "tweet-1",
        media_asset_id: "asset-1"
      },
      tweet: {
        tweet_url: "https://x.com/example/status/1",
        author_username: "example"
      },
      media: {
        source_url: "https://pbs.twimg.com/media/source.jpg",
        local_file_path: "/tmp/source.jpg"
      },
      analysis: {
        usageId: "usage-1"
      }
    });
  });
});
