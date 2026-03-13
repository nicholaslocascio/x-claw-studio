import fs from "node:fs";
import path from "node:path";
import type { DesiredReplyMediaWishlistEntry } from "@/src/lib/reply-composer";
import { buildUsageId } from "@/src/lib/usage-id";
import type {
  CapturedTweetFilter,
  CapturedTweetPage,
  CapturedTweetRecord,
  CrawlManifest,
  ExtractedTweet,
  MediaAssetRecord,
  TopicClusterRecord,
  TopicIndex,
  RunHistoryEntry,
  SchedulerConfig,
  TweetUsageRecord,
  UsageAnalysis
} from "@/src/lib/types";
import { readRunHistory, readSchedulerConfig } from "@/src/server/run-control";
import { readAllUsageAnalyses } from "@/src/server/analysis-store";
import { buildDuplicateGroupMap, buildPhashMatchMap, readMediaAssetIndex } from "@/src/server/media-assets";
import { materializeUsageAnalysisFromAssetVideo, readAllAssetVideoAnalyses } from "@/src/server/media-asset-video";
import { readReplyMediaWishlist } from "@/src/server/reply-media-wishlist";
import { emptyTopicIndex, readTopicIndex } from "@/src/server/tweet-topics";

export interface DashboardData {
  manifests: CrawlManifest[];
  schedulerConfig: SchedulerConfig;
  runHistory: RunHistoryEntry[];
  totalTweetCount: number;
  capturedTweets: CapturedTweetRecord[];
  tweetUsages: TweetUsageRecord[];
  topicIndex: TopicIndex;
  topicClusters: TopicClusterRecord[];
  replyMediaWishlist: DesiredReplyMediaWishlistEntry[];
}

const projectRoot = process.cwd();
const HOTNESS_HALF_LIFE_HOURS = 48;
const HOTNESS_DUPLICATE_WEIGHT = 2.5;
const HOTNESS_LIKE_WEIGHT = 1;
export const CAPTURED_TWEET_PAGE_SIZE = 200;
export const MAX_CAPTURED_TWEET_PAGE_SIZE = 200;

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function buildTweetKey(tweet: ExtractedTweet): string {
  return tweet.tweetId ?? `${tweet.sourceName}:${tweet.authorUsername ?? "unknown"}:${tweet.text ?? ""}`;
}

function loadCrawlManifests(): CrawlManifest[] {
  const rawDir = path.join(projectRoot, "data", "raw");
  if (!fs.existsSync(rawDir)) {
    return [];
  }

  return fs
    .readdirSync(rawDir)
    .map((runId) => path.join(rawDir, runId, "manifest.json"))
    .map((manifestPath) => readJsonFile<CrawlManifest>(manifestPath))
    .filter((value): value is CrawlManifest => Boolean(value))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function buildPendingAnalyses(tweets: ExtractedTweet[]): DashboardData["tweetUsages"] {
  return tweets.flatMap((tweet) =>
    tweet.media.map((media, mediaIndex) => {
      const usageId = buildUsageId(tweet, mediaIndex);

      return {
        usageId,
        tweet,
        mediaIndex,
        analysis: {
          usageId,
          tweetId: tweet.tweetId,
          mediaIndex,
          mediaKind: media.mediaKind,
          status: "pending",
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
          usage_notes: null
        },
        mediaAssetId: null,
        mediaLocalFilePath: null,
        mediaPlayableFilePath: null,
        mediaAssetStarred: false,
        mediaAssetUsageCount: 0,
        phashMatchCount: 0,
        duplicateGroupId: null,
        duplicateGroupUsageCount: 0,
        hotnessScore: 0
      };
    })
  );
}

export function buildCapturedTweetRecords(input: {
  tweets: ExtractedTweet[];
  analysisMap: Map<string, UsageAnalysis>;
  usageToAssetIdMap?: Map<string, string>;
  assetStarredMap?: Map<string, boolean>;
  topicLabelsByTweetKey?: Map<string, string[]>;
  topTopicByTweetKey?: Map<string, { label: string | null; hotnessScore: number }>;
}): CapturedTweetRecord[] {
  return input.tweets.map((tweet) => {
    const firstUsageId = tweet.media[0] ? buildUsageId(tweet, 0) : null;
    const firstMediaAssetId = firstUsageId ? input.usageToAssetIdMap?.get(firstUsageId) ?? null : null;
    const tweetKey = buildTweetKey(tweet);
    const topTopic = input.topTopicByTweetKey?.get(tweetKey);

    return {
      tweetKey,
      tweet,
      hasMedia: tweet.media.length > 0,
      mediaCount: tweet.media.length,
      analyzedMediaCount: tweet.media.reduce((count, _media, mediaIndex) => {
        const usageId = buildUsageId(tweet, mediaIndex);
        return count + (input.analysisMap.get(usageId)?.status === "complete" ? 1 : 0);
      }, 0),
      firstMediaAssetId,
      firstMediaAssetStarred: firstMediaAssetId ? input.assetStarredMap?.get(firstMediaAssetId) ?? false : false,
      topicLabels: input.topicLabelsByTweetKey?.get(tweetKey) ?? [],
      topTopicLabel: topTopic?.label ?? null,
      topTopicHotnessScore: topTopic?.hotnessScore ?? 0
    };
  });
}

function buildAssetUsageCountMap(assets: MediaAssetRecord[] | undefined): Map<string, number> {
  return new Map((assets ?? []).map((asset) => [asset.assetId, asset.usageIds.length]));
}

export function parseCompactNumber(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const normalized = value.trim().toLowerCase().replace(/,/g, "");
  const match = normalized.match(/^(\d+(?:\.\d+)?)([kmb])?$/i);
  if (!match) {
    const fallback = Number(normalized);
    return Number.isFinite(fallback) ? fallback : 0;
  }

  const amount = Number(match[1]);
  const suffix = match[2];
  if (!Number.isFinite(amount)) {
    return 0;
  }

  switch (suffix) {
    case "k":
      return Math.round(amount * 1_000);
    case "m":
      return Math.round(amount * 1_000_000);
    case "b":
      return Math.round(amount * 1_000_000_000);
    default:
      return Math.round(amount);
  }
}

function getUsageTimestampMs(usage: TweetUsageRecord): number {
  const timestamp = usage.tweet.createdAt ?? usage.tweet.extraction.extractedAt ?? null;
  const parsed = timestamp ? Date.parse(timestamp) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function getCapturedTweetTimestampMs(record: CapturedTweetRecord): number {
  const timestamp = record.tweet.createdAt ?? record.tweet.extraction.extractedAt ?? null;
  const parsed = timestamp ? Date.parse(timestamp) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCapturedTweetFilter(value: string | null | undefined): CapturedTweetFilter {
  switch (value) {
    case "with_media":
    case "without_media":
    case "all":
      return value;
    default:
      return "all";
  }
}

function normalizeCapturedTweetQuery(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function matchesCapturedTweetQuery(entry: CapturedTweetRecord, normalizedQuery: string): boolean {
  if (!normalizedQuery) {
    return true;
  }

  return [
    entry.tweet.authorUsername,
    entry.tweet.authorDisplayName,
    entry.tweet.text
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

function matchesCapturedTweetFilter(entry: CapturedTweetRecord, tweetFilter: CapturedTweetFilter): boolean {
  if (tweetFilter === "with_media") {
    return entry.hasMedia;
  }

  if (tweetFilter === "without_media") {
    return !entry.hasMedia;
  }

  return true;
}

export function getCapturedTweetPage(input: {
  tweets: CapturedTweetRecord[];
  page?: number;
  pageSize?: number;
  query?: string | null;
  tweetFilter?: string | null;
}): CapturedTweetPage {
  const normalizedQuery = normalizeCapturedTweetQuery(input.query);
  const normalizedQueryLower = normalizedQuery.toLowerCase();
  const tweetFilter = normalizeCapturedTweetFilter(input.tweetFilter);
  const pageSize = Math.min(MAX_CAPTURED_TWEET_PAGE_SIZE, Math.max(1, Math.floor(input.pageSize ?? CAPTURED_TWEET_PAGE_SIZE)));
  const queryMatches = input.tweets
    .filter((entry) => matchesCapturedTweetQuery(entry, normalizedQueryLower))
    .sort((left, right) => getCapturedTweetTimestampMs(right) - getCapturedTweetTimestampMs(left));
  const counts = {
    with_media: queryMatches.filter((entry) => entry.hasMedia).length,
    without_media: queryMatches.filter((entry) => !entry.hasMedia).length,
    all: queryMatches.length
  } satisfies Record<CapturedTweetFilter, number>;
  const filteredTweets = queryMatches.filter((entry) => matchesCapturedTweetFilter(entry, tweetFilter));
  const totalResults = filteredTweets.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const page = Math.min(Math.max(1, Math.floor(input.page ?? 1)), totalPages);
  const startIndex = (page - 1) * pageSize;

  return {
    tweets: filteredTweets.slice(startIndex, startIndex + pageSize),
    page,
    pageSize,
    totalResults,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
    query: normalizedQuery,
    tweetFilter,
    counts
  };
}

export function computeHotnessScore(input: {
  duplicateCount: number;
  totalLikes: number;
  mostRecentTimestampMs: number;
  nowMs?: number;
}): number {
  const duplicateCount = Math.max(1, input.duplicateCount);
  const totalLikes = Math.max(0, input.totalLikes);
  const mostRecentTimestampMs = Number.isFinite(input.mostRecentTimestampMs) ? input.mostRecentTimestampMs : 0;
  const nowMs = input.nowMs ?? Date.now();
  const ageHours = Math.max(0, (nowMs - mostRecentTimestampMs) / (1000 * 60 * 60));
  const decay = Math.exp((-Math.log(2) * ageHours) / HOTNESS_HALF_LIFE_HOURS);
  const engagement =
    1 +
    HOTNESS_DUPLICATE_WEIGHT * Math.log1p(duplicateCount) +
    HOTNESS_LIKE_WEIGHT * Math.log1p(totalLikes);

  const score = engagement * decay;
  return Number.isFinite(score) ? Number(score.toFixed(4)) : 0;
}

function buildHotnessScoreByUsageId(input: {
  usages: TweetUsageRecord[];
  duplicateGroupMap: Record<string, { groupId: string; usageIds: string[] }>;
}): Map<string, number> {
  const usageById = new Map(input.usages.map((usage) => [usage.usageId, usage]));
  const scoresByGroupId = new Map<string, number>();

  for (const usage of input.usages) {
    const duplicateGroup = input.duplicateGroupMap[usage.usageId];
    const groupId = duplicateGroup?.groupId ?? usage.mediaAssetId ?? usage.usageId;
    if (scoresByGroupId.has(groupId)) {
      continue;
    }

    const groupUsages = (duplicateGroup?.usageIds ?? [usage.usageId])
      .map((usageId) => usageById.get(usageId))
      .filter((value): value is TweetUsageRecord => Boolean(value));

    const totalLikes = groupUsages.reduce((sum, entry) => sum + parseCompactNumber(entry.tweet.metrics.likes), 0);
    const mostRecentTimestampMs = groupUsages.reduce((latest, entry) => Math.max(latest, getUsageTimestampMs(entry)), 0);
    const score = computeHotnessScore({
      duplicateCount: groupUsages.length,
      totalLikes,
      mostRecentTimestampMs
    });

    scoresByGroupId.set(groupId, score);
  }

  return new Map(
    input.usages.map((usage) => {
      const duplicateGroup = input.duplicateGroupMap[usage.usageId];
      const groupId = duplicateGroup?.groupId ?? usage.mediaAssetId ?? usage.usageId;
      return [usage.usageId, scoresByGroupId.get(groupId) ?? 0];
    })
  );
}

export function getDashboardData(): DashboardData {
  const manifests = loadCrawlManifests();
  const schedulerConfig = readSchedulerConfig();
  const runHistory = readRunHistory();
  const replyMediaWishlist = readReplyMediaWishlist();
  const savedAnalyses = readAllUsageAnalyses();
  const assetVideoAnalyses = readAllAssetVideoAnalyses();
  const assetIndex = readMediaAssetIndex();
  const analysisMap = new Map(savedAnalyses.map((analysis) => [analysis.usageId, analysis]));
  const assetVideoAnalysisMap = new Map(
    assetVideoAnalyses
      .filter((analysis) => analysis.status === "complete")
      .map((analysis) => [analysis.usageId.replace("::video", ""), analysis])
  );
  const mergedTweets = manifests.flatMap((manifest) => manifest.capturedTweets);
  const tweetMap = new Map(
    mergedTweets.map((tweet) => [buildTweetKey(tweet), tweet])
  );
  const sourceTweets = Array.from(tweetMap.values());
  const tweetUsages = buildPendingAnalyses(sourceTweets).map((usage) => {
    const mediaAssetId = assetIndex?.usageToAssetId[usage.usageId] ?? null;
    const preferredVideoAnalysis = mediaAssetId ? assetVideoAnalysisMap.get(mediaAssetId) ?? null : null;
    const savedAnalysis = analysisMap.get(buildUsageId(usage.tweet, usage.mediaIndex)) ?? usage.analysis;

    return {
      ...usage,
      analysis: preferredVideoAnalysis
        ? materializeUsageAnalysisFromAssetVideo(preferredVideoAnalysis, usage)
        : savedAnalysis,
      mediaAssetId,
      mediaAssetUsageCount: 0,
      phashMatchCount: 0,
      duplicateGroupId: null,
      duplicateGroupUsageCount: 0,
      hotnessScore: 0
    };
  });
  const assetUsageCountMap = buildAssetUsageCountMap(assetIndex?.assets);
  const assetLocalFilePathMap = new Map((assetIndex?.assets ?? []).map((asset) => [asset.assetId, asset.canonicalFilePath]));
  const assetPlayableFilePathMap = new Map((assetIndex?.assets ?? []).map((asset) => [asset.assetId, asset.promotedVideoFilePath]));
  const assetStarredMap = new Map((assetIndex?.assets ?? []).map((asset) => [asset.assetId, asset.starred]));
  const usageToAssetIdMap = new Map(Object.entries(assetIndex?.usageToAssetId ?? {}));
  const phashMatchMap = assetIndex ? buildPhashMatchMap({ assets: assetIndex.assets, usages: tweetUsages }) : {};
  const duplicateGroupMap = assetIndex ? buildDuplicateGroupMap({ assets: assetIndex.assets, usages: tweetUsages }) : {};
  const hotnessScoreByUsageId = buildHotnessScoreByUsageId({
    usages: tweetUsages,
    duplicateGroupMap
  });
  const enrichedUsages = tweetUsages.map((usage) => {
    const assetId = usage.mediaAssetId;
    const duplicateGroup = duplicateGroupMap[usage.usageId];
    return {
      ...usage,
      mediaLocalFilePath: assetId ? assetLocalFilePathMap.get(assetId) ?? null : null,
      mediaPlayableFilePath: assetId ? assetPlayableFilePathMap.get(assetId) ?? null : null,
      mediaAssetStarred: assetId ? assetStarredMap.get(assetId) ?? false : false,
      mediaAssetUsageCount: assetId ? assetUsageCountMap.get(assetId) ?? 0 : 0,
      phashMatchCount: assetId ? phashMatchMap[assetId]?.length ?? 0 : 0,
      duplicateGroupId: duplicateGroup?.groupId ?? assetId ?? usage.usageId,
      duplicateGroupUsageCount: duplicateGroup?.usageIds.length ?? (assetId ? assetUsageCountMap.get(assetId) ?? 1 : 1),
      hotnessScore: hotnessScoreByUsageId.get(usage.usageId) ?? 0
    };
  });
  const topicIndex = readTopicIndex() ?? emptyTopicIndex(sourceTweets.length);
  const topicLabelById = new Map(topicIndex.topics.map((topic) => [topic.topicId, topic.label]));
  const topicLabelsByTweetKey = new Map(
    topicIndex.tweets.map((tweet) => [
      tweet.tweetKey,
      tweet.topicIds
        .map((topicId) => topicLabelById.get(topicId) ?? null)
        .filter((value): value is string => Boolean(value))
        .slice(0, 4)
    ])
  );
  const topTopicByTweetKey = new Map(
    topicIndex.tweets.map((tweet) => [
      tweet.tweetKey,
      {
        label: tweet.topTopicLabel,
        hotnessScore: tweet.topTopicHotnessScore
      }
    ])
  );
  const capturedTweets = buildCapturedTweetRecords({
    tweets: sourceTweets,
    analysisMap,
    usageToAssetIdMap,
    assetStarredMap,
    topicLabelsByTweetKey,
    topTopicByTweetKey
  });

  return {
    manifests,
    schedulerConfig,
    runHistory,
    totalTweetCount: sourceTweets.length,
    capturedTweets,
    tweetUsages: enrichedUsages,
    topicIndex,
    topicClusters: topicIndex.topics,
    replyMediaWishlist
  };
}
