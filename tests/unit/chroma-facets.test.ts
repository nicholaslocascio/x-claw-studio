import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MediaAssetRecord,
  MediaAssetSummary,
  TopicClusterRecord,
  TweetTopicAnalysisRecord,
  TweetUsageRecord,
  UsageAnalysis
} from "@/src/lib/types";

const mockUsages: TweetUsageRecord[] = [];
const mockAnalyses: UsageAnalysis[] = [];
const mockTopicAnalyses: TweetTopicAnalysisRecord[] = [];
const mockTopicClusters: TopicClusterRecord[] = [];
const mockAssetSummaries: MediaAssetSummary[] = [];
const mockDeleteCollection = vi.fn(async () => undefined);
const mockQuery = vi.fn(async () => ({
  ids: [[]],
  documents: [[]],
  metadatas: [[]],
  distances: [[]]
}));
const mockUpsert = vi.fn(async () => undefined);
const mockGetOrCreateCollection = vi.fn(async () => ({
  query: mockQuery,
  upsert: mockUpsert
}));
const mockEmbedContent = vi.fn(async ({ contents }: { contents: string[] }) => ({
  embeddings: contents.map((_, index) => ({
    values: [index + 0.1, index + 0.2, index + 0.3]
  }))
}));

vi.mock("@/src/server/data", () => ({
  getDashboardData: () => ({
    tweetUsages: mockUsages,
    topicClusters: mockTopicClusters
  }),
  getLightweightUsageData: () => mockUsages,
  getReadModelCacheKey: () =>
    `test-read-model-cache-key:${mockUsages.length}:${mockAssetSummaries.length}:${mockTopicAnalyses.length}:${mockTopicClusters.length}`
}));

vi.mock("@/src/server/analysis-store", () => ({
  readAllUsageAnalyses: () => mockAnalyses
}));

vi.mock("@/src/server/topic-analysis-store", () => ({
  readAllTopicAnalyses: () => mockTopicAnalyses
}));

vi.mock("@/src/server/media-assets", () => ({
  readMediaAssetIndex: () => ({
    generatedAt: new Date("2026-03-10T12:00:00.000Z").toISOString(),
    assets: Array.from(
      new Map(
        mockUsages
          .filter((usage): usage is TweetUsageRecord & { mediaAssetId: string } => Boolean(usage.mediaAssetId))
          .map((usage) => [
            usage.mediaAssetId,
            {
              assetId: usage.mediaAssetId,
              canonicalMediaUrl: null,
              canonicalFilePath: null,
              promotedVideoSourceUrl: null,
              promotedVideoFilePath: usage.mediaPlayableFilePath,
              mediaKind: usage.analysis.mediaKind,
              fingerprint: null,
              similarityEmbedding: null,
              starred: usage.mediaAssetStarred,
              usageIds: mockUsages.filter((candidate) => candidate.mediaAssetId === usage.mediaAssetId).map((candidate) => candidate.usageId),
              sourceUrls: [],
              previewUrls: [],
              posterUrls: [],
              createdAt: new Date("2026-03-10T12:00:00.000Z").toISOString(),
              updatedAt: new Date("2026-03-10T12:00:00.000Z").toISOString()
            } satisfies MediaAssetRecord
          ])
      ).values()
    ),
    usageToAssetId: Object.fromEntries(
      mockUsages
        .filter((usage): usage is TweetUsageRecord & { mediaAssetId: string } => Boolean(usage.mediaAssetId))
        .map((usage) => [usage.usageId, usage.mediaAssetId])
    )
  }),
  readMediaAssetSummaries: () => ({
    generatedAt: new Date("2026-03-10T12:00:00.000Z").toISOString(),
    summaries: mockAssetSummaries
  })
}));

vi.mock("chromadb", () => ({
  registerEmbeddingFunction: vi.fn(),
  ChromaClient: class {
    async getOrCreateCollection() {
      return mockGetOrCreateCollection();
    }

    async deleteCollection() {
      return mockDeleteCollection();
    }
  }
}));

vi.mock("@google/genai", () => ({
  Type: {
    OBJECT: "OBJECT",
    STRING: "STRING",
    INTEGER: "INTEGER",
    BOOLEAN: "BOOLEAN",
    ARRAY: "ARRAY"
  },
  GoogleGenAI: class {
    models = {
      embedContent: mockEmbedContent
    };
  }
}));

function createAnalysis(index: number): UsageAnalysis {
  return {
    usageId: `usage-${index}`,
    tweetId: `tweet-${index}`,
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
    caption_brief: `Terminal dashboard capture ${index}`,
    scene_description: "Operators reviewing a market dashboard.",
    ocr_text: "ALERT MODE",
    primary_subjects: ["operator"],
    secondary_subjects: ["dashboard"],
    visible_objects: ["monitor", "chart"],
    setting_context: "trading desk",
    action_or_event: "monitoring",
    video_music: null,
    video_sound: null,
    video_dialogue: null,
    video_action: null,
    primary_emotion: "focus",
    emotional_tone: "analytical",
    conveys: `signal-${index}`,
    user_intent: "educate",
    rhetorical_role: "evidence",
    text_media_relationship: "supports the claim",
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

function createUsage(index: number): TweetUsageRecord {
  const analysis = createAnalysis(index);

  return {
    usageId: analysis.usageId,
    tweet: {
      sourceName: "fixture",
      tweetId: analysis.tweetId,
      tweetUrl: null,
      authorHandle: "@fixture",
      authorUsername: `fixture-${index}`,
      authorDisplayName: `Fixture ${index}`,
      authorProfileImageUrl: null,
      createdAt: null,
      text: `Terminal dashboard screenshot ${index}`,
      metrics: { replies: null, reposts: null, likes: null, bookmarks: null, views: null },
      media: [{ mediaKind: "image", sourceUrl: null, previewUrl: null, posterUrl: null }],
      extraction: { articleIndex: 0, extractedAt: new Date("2026-03-10T12:00:00.000Z").toISOString() }
    },
    mediaIndex: 0,
    analysis,
    mediaAssetId: `asset-${index}`,
    mediaLocalFilePath: null,
    mediaPlayableFilePath: null,
    mediaAssetStarred: false,
    mediaAssetUsageCount: 1,
    phashMatchCount: 0,
    duplicateGroupId: null,
    duplicateGroupUsageCount: 1,
    hotnessScore: 0
  };
}

function createAssetSummary(
  usage: TweetUsageRecord,
  overrides?: {
    assetId?: string;
    usageCount?: number;
  }
): MediaAssetSummary {
  return {
    assetId: overrides?.assetId ?? usage.mediaAssetId ?? `asset-${usage.usageId}`,
    status: "aggregated",
    sourceUsageId: usage.usageId,
    usageCount: overrides?.usageCount ?? usage.mediaAssetUsageCount,
    completeAnalysisCount: 1,
    summary: usage.analysis,
    createdAt: new Date("2026-03-10T12:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-03-10T12:00:00.000Z").toISOString()
  };
}

describe("searchFacetIndex", () => {
  beforeEach(() => {
    vi.resetModules();
    mockUsages.length = 0;
    mockAnalyses.length = 0;
    mockTopicAnalyses.length = 0;
    mockTopicClusters.length = 0;
    mockAssetSummaries.length = 0;
    mockDeleteCollection.mockClear();
    mockQuery.mockClear();
    mockQuery.mockResolvedValue({
      ids: [[]],
      documents: [[]],
      metadatas: [[]],
      distances: [[]]
    });
    mockUpsert.mockClear();
    mockGetOrCreateCollection.mockClear();
    mockGetOrCreateCollection.mockResolvedValue({
      query: mockQuery,
      upsert: mockUpsert
    });
    mockEmbedContent.mockClear();
    mockEmbedContent.mockImplementation(async ({ contents }: { contents: string[] }) => ({
      embeddings: contents.map((_, index) => ({
        values: [index + 0.1, index + 0.2, index + 0.3]
      }))
    }));
  });

  it("uses enriched lexical documents beyond raw facet values", async () => {
    const usage = createUsage(1);
    usage.mediaAssetStarred = true;
    mockUsages.push(usage);
    mockAssetSummaries.push(createAssetSummary(usage));

    const { searchFacetIndex } = await import("@/src/server/chroma-facets");
    const result = await searchFacetIndex({
      query: "dashboard terminal",
      facetName: "conveys"
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.document).toContain("tweet_text: Terminal dashboard screenshot 1");
    expect(result.results[0]?.document).toContain("search_keywords: dashboard, terminal");
    expect(result.results[0]?.metadata).toMatchObject({
      facet_name: "conveys",
      facet_value: "signal-1",
      facet_description: expect.any(String),
      media_index: 0
    });
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          $and: [{ analysis_scope: "asset_summary" }, { facet_name: "conveys" }]
        }
      })
    );
  });

  it("defaults to 20 results when no limit is provided", async () => {
    for (let index = 1; index <= 25; index += 1) {
      const usage = createUsage(index);
      usage.mediaAssetStarred = true;
      mockUsages.push(usage);
      mockAssetSummaries.push(createAssetSummary(usage));
    }

    const { searchFacetIndex } = await import("@/src/server/chroma-facets");
    const result = await searchFacetIndex({
      query: "dashboard",
      facetName: "conveys"
    });

    expect(result.limit).toBe(20);
    expect(result.results).toHaveLength(20);
  });

  it("can filter to high-quality video-like results only", async () => {
    const lowQualityImage = createUsage(1);
    const starredVideo = createUsage(2);
    starredVideo.analysis.mediaKind = "video";
    starredVideo.tweet.media[0] = { mediaKind: "video", sourceUrl: null, previewUrl: null, posterUrl: null };
    starredVideo.mediaPlayableFilePath = "/tmp/video.mp4";
    starredVideo.mediaAssetStarred = true;
    starredVideo.hotnessScore = 6.2;

    const duplicateVideo = createUsage(3);
    duplicateVideo.analysis.mediaKind = "video_hls";
    duplicateVideo.tweet.media[0] = { mediaKind: "video_hls", sourceUrl: null, previewUrl: null, posterUrl: null };
    duplicateVideo.mediaPlayableFilePath = "/tmp/video-2.mp4";
    duplicateVideo.duplicateGroupUsageCount = 3;

    mockUsages.push(lowQualityImage, starredVideo, duplicateVideo);
    mockAssetSummaries.push(createAssetSummary(lowQualityImage));
    mockAssetSummaries.push(createAssetSummary(starredVideo));
    mockAssetSummaries.push(createAssetSummary(duplicateVideo));

    const { searchFacetIndex } = await import("@/src/server/chroma-facets");
    const result = await searchFacetIndex({
      query: "dashboard",
      facetName: "conveys",
      mediaKinds: ["video", "video_hls", "video_blob"],
      highQualityOnly: true
    });

    expect(result.filters).toEqual({
      mediaKinds: ["video", "video_hls", "video_blob"],
      highQualityOnly: true,
      allFacetsMode: "combined_blob",
      hardMatchMode: "off"
    });
    expect(result.vectorStatus).toBe("ok");
    expect(result.warningMessage).toBeNull();
    expect(result.results).toHaveLength(2);
    expect(result.results.every((row) => row.media?.mediaPlayableFilePath)).toBe(true);
  });

  it("over-fetches candidates before applying the high-quality filter", async () => {
    for (let index = 1; index <= 60; index += 1) {
      const usage = createUsage(index);
      if (index > 55) {
        usage.mediaAssetUsageCount = 2;
        usage.duplicateGroupUsageCount = 2;
      }
      mockUsages.push(usage);
      mockAssetSummaries.push(createAssetSummary(usage, {
        usageCount: usage.mediaAssetUsageCount
      }));
    }

    mockQuery.mockResolvedValue({
      ids: [mockUsages.map((usage) => `${usage.mediaAssetId}::group-search::conveys`)],
      documents: [mockUsages.map((usage) => usage.analysis.conveys ?? "")],
      metadatas: [mockUsages.map((usage) => ({
        analysis_scope: "asset_summary",
        facet_name: "conveys",
        usage_id: usage.usageId,
        asset_id: usage.mediaAssetId,
        media_kind: usage.analysis.mediaKind
      }))],
      distances: [mockUsages.map((_, index) => index / 100)]
    } as never);

    const { searchFacetIndex } = await import("@/src/server/chroma-facets");
    const result = await searchFacetIndex({
      query: "dashboard",
      facetName: "conveys",
      limit: 5,
      highQualityOnly: true
    });

    expect(result.results).toHaveLength(5);
    expect(result.results.map((row) => row.metadata.usage_id)).toEqual([
      "usage-56",
      "usage-57",
      "usage-58",
      "usage-59",
      "usage-60"
    ]);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        nResults: 240
      })
    );
  });

  it("returns one result for a duplicated asset instead of one per usage", async () => {
    const firstUsage = createUsage(1);
    firstUsage.mediaAssetId = "shared-asset";
    firstUsage.mediaAssetStarred = true;

    const secondUsage = createUsage(2);
    secondUsage.mediaAssetId = "shared-asset";
    secondUsage.mediaAssetStarred = true;
    secondUsage.duplicateGroupId = "duplicate-group-1";
    secondUsage.duplicateGroupUsageCount = 2;
    firstUsage.duplicateGroupId = "duplicate-group-1";
    firstUsage.duplicateGroupUsageCount = 2;

    mockUsages.push(firstUsage, secondUsage);
    mockAssetSummaries.push(createAssetSummary(firstUsage, {
      assetId: "shared-asset",
      usageCount: 2
    }));

    const { searchFacetIndex } = await import("@/src/server/chroma-facets");
    const result = await searchFacetIndex({
      query: "dashboard",
      highQualityOnly: true
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.media?.mediaAssetId).toBe("shared-asset");
  });

  it("collapses different asset ids inside the same duplicate group", async () => {
    const firstUsage = createUsage(1);
    firstUsage.mediaAssetId = "asset-a";
    firstUsage.mediaAssetStarred = true;
    firstUsage.duplicateGroupId = "dup-group-shared";
    firstUsage.duplicateGroupUsageCount = 8;
    firstUsage.analysis.search_keywords = ["party"];
    firstUsage.analysis.scene_description = "Party dance floor.";

    const secondUsage = createUsage(2);
    secondUsage.mediaAssetId = "asset-b";
    secondUsage.mediaAssetStarred = true;
    secondUsage.duplicateGroupId = "dup-group-shared";
    secondUsage.duplicateGroupUsageCount = 8;
    secondUsage.analysis.search_keywords = ["party"];
    secondUsage.analysis.scene_description = "Party dance floor.";

    mockUsages.push(firstUsage, secondUsage);
    mockAssetSummaries.push(createAssetSummary(firstUsage, { assetId: "asset-a", usageCount: 4 }));
    mockAssetSummaries.push(createAssetSummary(secondUsage, { assetId: "asset-b", usageCount: 4 }));

    const { searchFacetIndex } = await import("@/src/server/chroma-facets");
    const result = await searchFacetIndex({
      query: "party",
      allFacetsMode: "combined_blob"
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.media?.duplicateGroupId).toBe("dup-group-shared");
  });

  it("supports combined-blob all-facets mode", async () => {
    const usage = createUsage(1);
    usage.mediaAssetStarred = true;
    mockUsages.push(usage);
    mockAssetSummaries.push(createAssetSummary(usage));

    const { searchFacetIndex } = await import("@/src/server/chroma-facets");
    const result = await searchFacetIndex({
      query: "dashboard terminal",
      allFacetsMode: "combined_blob"
    });

    expect(result.filters).toEqual({
      mediaKinds: null,
      highQualityOnly: true,
      allFacetsMode: "combined_blob",
      hardMatchMode: "off"
    });
    expect(result.vectorStatus).toBe("ok");
    expect(result.warningMessage).toBeNull();
    expect(result.results).toHaveLength(1);
  });

  it("does not treat false boolean facet rows as a lexical hit for female queries", async () => {
    const femaleUsage = createUsage(1);
    femaleUsage.mediaAssetStarred = true;
    femaleUsage.analysis.features_female = true;
    femaleUsage.analysis.features_male = false;
    femaleUsage.analysis.caption_brief = "Woman reacting to breaking news.";

    const falseFlagUsage = createUsage(2);
    falseFlagUsage.mediaAssetStarred = true;
    falseFlagUsage.analysis.features_female = false;
    falseFlagUsage.analysis.features_male = true;
    falseFlagUsage.analysis.caption_brief = "Ryan Gosling staring at a laptop.";

    const femaleVocalsUsage = createUsage(3);
    femaleVocalsUsage.mediaAssetStarred = true;
    femaleVocalsUsage.analysis.mediaKind = "video";
    femaleVocalsUsage.analysis.video_music = "gentle song with female vocals";
    femaleVocalsUsage.analysis.caption_brief = "A man sits still while music plays.";

    mockUsages.push(femaleUsage, falseFlagUsage, femaleVocalsUsage);
    mockAssetSummaries.push(createAssetSummary(femaleUsage));
    mockAssetSummaries.push(createAssetSummary(falseFlagUsage));
    mockAssetSummaries.push(createAssetSummary(femaleVocalsUsage));

    const { searchFacetIndex } = await import("@/src/server/chroma-facets");
    const result = await searchFacetIndex({
      query: "female",
      limit: 10,
      highQualityOnly: true,
      allFacetsMode: "facet_concat"
    });

    expect(result.results.some((row) => row.metadata.usage_id === falseFlagUsage.usageId)).toBe(false);
    expect(result.results[0]?.metadata.usage_id).toBe(femaleUsage.usageId);
  });

  it("returns a warning message when vector search falls back to lexical", async () => {
    const usage = createUsage(1);
    usage.mediaAssetStarred = true;
    mockUsages.push(usage);
    mockAssetSummaries.push(createAssetSummary(usage));
    mockQuery.mockRejectedValueOnce(new Error("chroma is down"));

    const { searchFacetIndex } = await import("@/src/server/chroma-facets");
    const result = await searchFacetIndex({
      query: "dashboard",
      facetName: "conveys"
    });

    expect(result.vectorStatus).toBe("unavailable");
    expect(result.warningMessage).toContain("Vector search is unavailable");
    expect(result.warningMessage).toContain("chroma is down");
    expect(result.results).toHaveLength(1);
  });

  it("splits Gemini embedding requests when asset-summary indexing exceeds 100 documents", async () => {
    for (let index = 1; index <= 101; index += 1) {
      const usage = createUsage(index);
      mockUsages.push(usage);
      mockAssetSummaries.push(createAssetSummary(usage));
    }

    const { syncFacetSearchAssetIndex } = await import("@/src/server/chroma-facets");
    const result = await syncFacetSearchAssetIndex({
      summaries: mockAssetSummaries,
      usages: mockUsages
    });

    expect(result.indexedCount).toBeGreaterThan(100);
    expect(mockEmbedContent.mock.calls.length).toBeGreaterThan(1);
    expect(mockEmbedContent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        model: expect.any(String),
        contents: expect.any(Array)
      })
    );
    expect(
      mockEmbedContent.mock.calls.every((call) => Array.isArray(call[0]?.contents) && call[0].contents.length <= 100)
    ).toBe(true);
    expect(mockEmbedContent.mock.calls[0]?.[0].contents).toHaveLength(100);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: expect.any(Array),
        documents: expect.any(Array),
        metadatas: expect.any(Array),
        embeddings: expect.any(Array)
      })
    );
    const upsertPayload = mockUpsert.mock.calls.at(0)?.at(0) as
      | {
          embeddings: unknown[];
          ids: unknown[];
        }
      | undefined;
    expect(upsertPayload).toBeDefined();
    if (!upsertPayload) {
      throw new Error("Expected first upsert payload");
    }
    expect(upsertPayload.embeddings).toHaveLength(result.indexedCount);
    expect(upsertPayload.ids).toHaveLength(result.indexedCount);
  });
});

describe("searchTopicIndex", () => {
  beforeEach(() => {
    vi.resetModules();
    mockUsages.length = 0;
    mockAnalyses.length = 0;
    mockTopicAnalyses.length = 0;
    mockTopicClusters.length = 0;
  });

  it("searches topic documents with topic posture and usage facets in the haystack", async () => {
    const usage = createUsage(1);
    usage.analysis.conveys = "AI coding tool consolidation";
    usage.analysis.brand_signals = ["Cursor", "OpenAI"];
    usage.analysis.search_keywords = ["agentic coding", "IDE replacement"];
    mockUsages.push(usage);
    mockAnalyses.push(usage.analysis);
    mockTopicAnalyses.push({
      analysisId: "topic-1",
      tweetKey: usage.tweet.tweetId ?? "tweet-1",
      tweetId: usage.tweet.tweetId,
      authorUsername: usage.tweet.authorUsername,
      createdAt: usage.tweet.createdAt,
      text: "Cursor is getting squeezed as agentic coding tools collapse into one stack.",
      usageIds: [usage.usageId],
      summaryLabel: "Agentic Coding Tool Consolidation",
      isNews: true,
      newsPeg: "AI coding suite bundling",
      whyNow: "Product lines are collapsing into broader AI coding platforms.",
      sentiment: "mixed",
      stance: "observational",
      emotionalTone: "analytical",
      opinionIntensity: "medium",
      targetEntity: "Cursor",
      confidence: 0.88,
      signals: [
        {
          key: "phrase:agentic coding tool consolidation",
          label: "Agentic Coding Tool Consolidation",
          kind: "phrase",
          source: "llm_topic",
          confidence: 0.88
        }
      ],
      analyzedAt: new Date("2026-03-10T12:00:00.000Z").toISOString(),
      model: "gemini-2.5-flash-lite"
    });
    mockTopicClusters.push({
      topicId: "phrase:agentic-coding-tool-consolidation",
      label: "Agentic Coding Tool Consolidation",
      normalizedLabel: "agentic coding tool consolidation",
      kind: "phrase",
      signalCount: 1,
      tweetCount: 3,
      mediaUsageCount: 1,
      textOnlyTweetCount: 0,
      uniqueAuthorCount: 3,
      totalLikes: 100,
      recentTweetCount24h: 2,
      mostRecentAt: "2026-03-10T12:00:00.000Z",
      oldestAt: "2026-03-09T12:00:00.000Z",
      hotnessScore: 6.4,
      isStale: false,
      sources: ["llm_topic"],
      representativeTweetKeys: ["tweet-1"],
      representativeTweets: [
        {
          tweetKey: "tweet-1",
          tweetId: "tweet-1",
          authorUsername: "fixture-1",
          text: "Cursor is getting squeezed as agentic coding tools collapse into one stack.",
          createdAt: "2026-03-10T12:00:00.000Z"
        }
      ],
      suggestedAngles: ["Write the second-order take."]
    });

    const { searchTopicIndex } = await import("@/src/server/chroma-facets");
    const result = await searchTopicIndex({
      query: "agentic coding IDE replacement Cursor"
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.document).toContain("stance: observational");
    expect(result.results[0]?.document).toContain("search_keyword: IDE replacement");
    expect(result.results[0]?.topic.label).toBe("Agentic Coding Tool Consolidation");
    expect(result.results[0]?.analysis.targetEntity).toBe("Cursor");
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { analysis_scope: "topic_tweet" }
      })
    );
  });

  it("repairs an incompatible Chroma collection config and retries the search", async () => {
    const usage = createUsage(1);
    mockUsages.push(usage);
    mockAnalyses.push(usage.analysis);
    mockAssetSummaries.push(createAssetSummary(usage));
    mockTopicAnalyses.push({
      analysisId: "topic-1",
      tweetKey: usage.tweet.tweetId ?? "tweet-1",
      tweetId: usage.tweet.tweetId,
      authorUsername: usage.tweet.authorUsername,
      createdAt: usage.tweet.createdAt,
      text: "Terminal dashboard chatter",
      usageIds: [usage.usageId],
      summaryLabel: "Terminal Dashboard",
      isNews: false,
      newsPeg: null,
      whyNow: "Operators keep posting it.",
      sentiment: "neutral",
      stance: "observational",
      emotionalTone: "analytical",
      opinionIntensity: "low",
      targetEntity: null,
      confidence: 0.8,
      signals: [],
      analyzedAt: new Date("2026-03-10T12:00:00.000Z").toISOString(),
      model: "gemini-2.5-flash-lite"
    });

    mockGetOrCreateCollection
      .mockRejectedValueOnce(
        new Error(
          "Failed to deserialize the JSON body into the target type: configuration.embedding_function: missing field `name` at line 1 column 154"
        )
      )
      .mockResolvedValue({
        query: mockQuery,
        upsert: mockUpsert
      });

    const { searchTopicIndex } = await import("@/src/server/chroma-facets");
    const result = await searchTopicIndex({
      query: "terminal dashboard"
    });

    expect(result.results).toHaveLength(1);
    expect(mockDeleteCollection).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalled();
    expect(mockGetOrCreateCollection.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
