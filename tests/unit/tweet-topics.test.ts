import { describe, expect, it } from "vitest";
import { buildUsageId } from "@/src/lib/usage-id";
import type { ExtractedTweet, TweetTopicAnalysisRecord, TweetUsageRecord, UsageAnalysis } from "@/src/lib/types";
import { buildTopicIndex, computeTopicHotnessScore } from "@/src/server/tweet-topics";

function createTweet(overrides: Partial<ExtractedTweet>): ExtractedTweet {
  return {
    sourceName: "test",
    tweetId: "tweet-1",
    tweetUrl: "https://x.com/example/status/1",
    authorHandle: "@example",
    authorUsername: "example",
    authorDisplayName: "Example",
    authorProfileImageUrl: null,
    createdAt: "2026-03-10T12:00:00.000Z",
    text: "OpenAI ships GPT-6 pricing update for enterprise users",
    metrics: {
      replies: "10",
      reposts: "22",
      likes: "500",
      bookmarks: null,
      views: "10K"
    },
    media: [],
    extraction: {
      articleIndex: 0,
      extractedAt: "2026-03-10T12:00:00.000Z"
    },
    ...overrides
  };
}

function createAnalysis(tweet: ExtractedTweet, mediaIndex: number, overrides: Partial<UsageAnalysis>): UsageAnalysis {
  return {
    usageId: buildUsageId(tweet, mediaIndex),
    tweetId: tweet.tweetId,
    mediaIndex,
    mediaKind: tweet.media[mediaIndex]?.mediaKind ?? "image",
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
}

function createUsage(tweet: ExtractedTweet, analysis: UsageAnalysis, hotnessScore: number): TweetUsageRecord {
  return {
    usageId: analysis.usageId,
    tweet,
    mediaIndex: analysis.mediaIndex,
    analysis,
    mediaAssetId: null,
    mediaLocalFilePath: null,
    mediaPlayableFilePath: null,
    mediaAssetStarred: false,
    mediaAssetUsageCount: 1,
    phashMatchCount: 0,
    duplicateGroupId: analysis.usageId,
    duplicateGroupUsageCount: 1,
    hotnessScore
  };
}

function createTopicAnalysis(tweet: ExtractedTweet, overrides: Partial<TweetTopicAnalysisRecord>): TweetTopicAnalysisRecord {
  return {
    analysisId: tweet.tweetId ?? "analysis-1",
    tweetKey: tweet.tweetId ?? "tweet-key",
    tweetId: tweet.tweetId,
    authorUsername: tweet.authorUsername,
    createdAt: tweet.createdAt,
    text: tweet.text,
    usageIds: [],
    summaryLabel: null,
    isNews: false,
    newsPeg: null,
    whyNow: null,
    sentiment: "neutral",
    stance: "observational",
    emotionalTone: null,
    opinionIntensity: "medium",
    targetEntity: null,
    confidence: 0.8,
    signals: [],
    analyzedAt: "2026-03-11T12:00:00.000Z",
    model: "gemini-2.5-flash-lite",
    ...overrides
  };
}

describe("computeTopicHotnessScore", () => {
  it("prefers fresher, broader activity", () => {
    const nowMs = Date.parse("2026-03-11T12:00:00.000Z");
    const fresh = computeTopicHotnessScore({
      tweetCount: 4,
      uniqueAuthorCount: 4,
      totalLikes: 2000,
      recentTweetCount24h: 4,
      mostRecentTimestampMs: nowMs - 60 * 60 * 1000,
      nowMs
    });
    const stale = computeTopicHotnessScore({
      tweetCount: 4,
      uniqueAuthorCount: 4,
      totalLikes: 2000,
      recentTweetCount24h: 0,
      mostRecentTimestampMs: nowMs - 6 * 24 * 60 * 60 * 1000,
      nowMs
    });

    expect(fresh).toBeGreaterThan(stale);
  });

  it("does not let a tiny fresh cluster outrank a stronger slightly older one too easily", () => {
    const nowMs = Date.parse("2026-03-11T12:00:00.000Z");
    const tinyFresh = computeTopicHotnessScore({
      tweetCount: 1,
      uniqueAuthorCount: 1,
      totalLikes: 10,
      recentTweetCount24h: 1,
      mostRecentTimestampMs: nowMs - 60 * 60 * 1000,
      nowMs
    });
    const broaderOlder = computeTopicHotnessScore({
      tweetCount: 6,
      uniqueAuthorCount: 5,
      totalLikes: 1200,
      recentTweetCount24h: 2,
      mostRecentTimestampMs: nowMs - 30 * 60 * 60 * 1000,
      nowMs
    });

    expect(broaderOlder).toBeGreaterThan(tinyFresh);
  });
});

describe("buildTopicIndex", () => {
  it("clusters related tweet and analysis signals and ranks them by hotness", () => {
    const tweetA = createTweet({
      tweetId: "tweet-a",
      authorUsername: "alpha",
      text: "OpenAI cuts GPT-6 pricing again for enterprise buyers",
      createdAt: "2026-03-11T10:00:00.000Z",
      media: [
        {
          mediaKind: "image",
          sourceUrl: "https://example.com/a.jpg",
          previewUrl: "https://example.com/a.jpg",
          posterUrl: "https://example.com/a.jpg"
        }
      ]
    });
    const tweetB = createTweet({
      tweetId: "tweet-b",
      authorUsername: "beta",
      text: "Enterprise teams are repricing around OpenAI this week",
      createdAt: "2026-03-11T09:00:00.000Z",
      metrics: {
        replies: "4",
        reposts: "8",
        likes: "300",
        bookmarks: null,
        views: "4K"
      }
    });
    const tweetC = createTweet({
      tweetId: "tweet-c",
      authorUsername: "gamma",
      text: "Old meme discourse about Doge from last month",
      createdAt: "2026-03-01T09:00:00.000Z",
      metrics: {
        replies: "1",
        reposts: "2",
        likes: "15",
        bookmarks: null,
        views: "500"
      }
    });

    const analysisA = createAnalysis(tweetA, 0, {
      brand_signals: ["OpenAI"],
      analogy_target: "GPT-6 pricing",
      search_keywords: ["enterprise pricing", "OpenAI pricing"]
    });
    const topicAnalysisA = createTopicAnalysis(tweetA, {
      summaryLabel: "OpenAI Pricing",
      isNews: true,
      signals: [
        { key: "brand:openai", label: "OpenAI", kind: "brand", source: "llm_topic", confidence: 0.95 },
        { key: "entity:gpt-6 pricing", label: "GPT-6 Pricing", kind: "entity", source: "llm_topic", confidence: 0.93 }
      ]
    });
    const topicAnalysisB = createTopicAnalysis(tweetB, {
      summaryLabel: "OpenAI Pricing",
      isNews: true,
      signals: [
        { key: "brand:openai", label: "OpenAI", kind: "brand", source: "llm_topic", confidence: 0.91 },
        { key: "entity:enterprise pricing", label: "Enterprise Pricing", kind: "entity", source: "llm_topic", confidence: 0.84 }
      ]
    });
    const topicAnalysisC = createTopicAnalysis(tweetC, {
      summaryLabel: "Doge",
      signals: [{ key: "entity:doge", label: "Doge", kind: "entity", source: "llm_topic", confidence: 0.88 }]
    });

    const index = buildTopicIndex({
      tweets: [tweetA, tweetB, tweetC],
      usages: [createUsage(tweetA, analysisA, 4.2)],
      topicAnalyses: [topicAnalysisA, topicAnalysisB, topicAnalysisC],
      nowMs: Date.parse("2026-03-11T12:00:00.000Z")
    });

    expect(index.topicCount).toBeGreaterThan(0);
    expect(index.topics[0]?.label).toMatch(/OpenAI|GPT-6 pricing/i);
    expect(index.topics[0]?.tweetCount).toBeGreaterThanOrEqual(2);
    expect(index.topics[0]?.isStale).toBe(false);

    const tweetRecord = index.tweets.find((tweet) => tweet.tweetId === "tweet-a");
    expect(tweetRecord?.topTopicLabel).toBeTruthy();
    expect(tweetRecord?.signals.some((signal) => /OpenAI|GPT-6 pricing/i.test(signal.label))).toBe(true);

    const staleTopic = index.topics.find((topic) => /doge/i.test(topic.label));
    expect(staleTopic?.isStale).toBe(true);
  });
});
