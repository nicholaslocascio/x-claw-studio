import fs from "node:fs";
import path from "node:path";
import type { DesiredReplyMediaWishlistEntry } from "@/src/lib/reply-composer";
import { buildUsageId } from "@/src/lib/usage-id";
import type {
  CapturedTweetFilter,
  CapturedTweetPage,
  CapturedTweetRecord,
  CapturedTweetSort,
  CrawlManifest,
  ExtractedTweet,
  MediaAssetSyncStatus,
  MediaAssetRecord,
  TopicClusterRecord,
  TopicClusterFreshnessFilter,
  TopicClusterKindFilter,
  TopicClusterPage,
  TopicClusterSort,
  TopicIndex,
  RunHistoryEntry,
  SchedulerConfig,
  UsageMatchFilter,
  UsagePage,
  UsageSort,
  TweetUsageRecord,
  UsageAnalysis
} from "@/src/lib/types";
import { readRunHistory, readSchedulerConfig } from "@/src/server/run-control";
import { readAllUsageAnalyses } from "@/src/server/analysis-store";
import { buildDuplicateGroupMap, buildPhashMatchMap, readMediaAssetIndex } from "@/src/server/media-assets";
import { materializeUsageAnalysisFromAssetVideo, readAllAssetVideoAnalyses } from "@/src/server/media-asset-video";
import { readReplyMediaWishlist } from "@/src/server/reply-media-wishlist";
import { listPriorityAccountUsernames } from "@/src/server/priority-accounts";
import { classifyRelativeEngagementBand, computeRelativeEngagementScore } from "@/src/server/relative-engagement";
import { emptyTopicIndex, readTopicIndex } from "@/src/server/tweet-topics";
import { readXAuthRecord } from "@/src/server/x-auth";

export interface DashboardData {
  manifests: CrawlManifest[];
  schedulerConfig: SchedulerConfig;
  runHistory: RunHistoryEntry[];
  xAuthWarning: {
    runControlId: string;
    task: RunHistoryEntry["task"];
    startedAt: string;
    logPath: string;
    reason: string;
  } | null;
  totalTweetCount: number;
  capturedTweets: CapturedTweetRecord[];
  tweetUsages: TweetUsageRecord[];
  topicIndex: TopicIndex;
  topicClusters: TopicClusterRecord[];
  replyMediaWishlist: DesiredReplyMediaWishlistEntry[];
}

export interface DashboardOverviewData {
  manifests: CrawlManifest[];
  runHistory: RunHistoryEntry[];
  xAuthWarning: DashboardData["xAuthWarning"];
  totalTweetCount: number;
  tweetsWithMediaCount: number;
  textOnlyTweetCount: number;
  totalUsageCount: number;
  completedUsageCount: number;
  pendingUsageCount: number;
  repeatedAssetUsageCount: number;
  starredUsageCount: number;
  indexedAssetUsageCount: number;
  staleAssetUsageCount: number;
  missingAssetUsageCount: number;
  topicClusters: TopicClusterRecord[];
  replyMediaWishlist: DesiredReplyMediaWishlistEntry[];
}

export interface TopicPageData {
  topicIndex: TopicIndex;
  topicClusters: TopicClusterRecord[];
}

export interface ControlPageData {
  manifests: CrawlManifest[];
  schedulerConfig: SchedulerConfig;
  runHistory: RunHistoryEntry[];
  xAuthWarning: DashboardData["xAuthWarning"];
}

export interface WishlistPageData {
  replyMediaWishlist: DesiredReplyMediaWishlistEntry[];
}

export interface UsageDetailData {
  usage: TweetUsageRecord | null;
  usages: TweetUsageRecord[];
}

export interface CapturedTweetData {
  totalTweetCount: number;
  capturedTweets: CapturedTweetRecord[];
}

const projectRoot = process.cwd();
const HOTNESS_HALF_LIFE_HOURS = 48;
const HOTNESS_DUPLICATE_WEIGHT = 2.5;
const HOTNESS_LIKE_WEIGHT = 1;
export const CAPTURED_TWEET_PAGE_SIZE = 200;
export const MAX_CAPTURED_TWEET_PAGE_SIZE = 200;
export const USAGE_PAGE_SIZE = 120;
export const MAX_USAGE_PAGE_SIZE = 200;
export const TOPIC_CLUSTER_PAGE_SIZE = 24;
export const MAX_TOPIC_CLUSTER_PAGE_SIZE = 100;
const rawDir = path.join(projectRoot, "data", "raw");
const analysisDir = path.join(projectRoot, "data", "analysis");
const controlDir = path.join(projectRoot, "data", "control");

let dashboardDataCache:
  | {
      key: string;
      value: DashboardData;
    }
  | null = null;

let lightweightUsageDataCache:
  | {
      key: string;
      value: TweetUsageRecord[];
    }
  | null = null;

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function buildTweetKey(tweet: ExtractedTweet): string {
  return tweet.tweetId ?? `${tweet.sourceName}:${tweet.authorUsername ?? "unknown"}:${tweet.text ?? ""}`;
}

function normalizeAuthorUsername(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/^@+/, "").toLowerCase() ?? "";
  return normalized || null;
}

function mergeSourceTweets(manifests: CrawlManifest[]): ExtractedTweet[] {
  const mergedTweets = manifests.flatMap((manifest) => manifest.capturedTweets);
  const tweetMap = new Map(mergedTweets.map((tweet) => [buildTweetKey(tweet), tweet]));
  return Array.from(tweetMap.values());
}

function loadCrawlManifests(): CrawlManifest[] {
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

function getPathSignature(targetPath: string): string {
  try {
    const stats = fs.statSync(targetPath);
    return `${stats.isDirectory() ? "dir" : "file"}:${stats.mtimeMs}:${stats.size}`;
  } catch {
    return "missing";
  }
}

function buildRawManifestSignature(): string {
  if (!fs.existsSync(rawDir)) {
    return "raw:missing";
  }

  const runIds = fs.readdirSync(rawDir).sort();
  return [
    `raw:${getPathSignature(rawDir)}`,
    ...runIds.map((runId) => {
      const runDir = path.join(rawDir, runId);
      const manifestPath = path.join(runDir, "manifest.json");
      return `${runId}:${getPathSignature(runDir)}:${getPathSignature(manifestPath)}`;
    })
  ].join("|");
}

function computeDashboardDataCacheKey(): string {
  return [
    buildRawManifestSignature(),
    `tweet-usages:${getPathSignature(path.join(analysisDir, "tweet-usages"))}`,
    `media-assets-dir:${getPathSignature(path.join(analysisDir, "media-assets"))}`,
    `media-assets-index:${getPathSignature(path.join(analysisDir, "media-assets", "index.json"))}`,
    `media-assets-videos:${getPathSignature(path.join(analysisDir, "media-assets", "video-analyses"))}`,
    `reply-wishlist:${getPathSignature(path.join(analysisDir, "reply-media-wishlist.json"))}`,
    `priority-accounts:${getPathSignature(path.join(controlDir, "priority-accounts.json"))}`,
    `topics-index:${getPathSignature(path.join(analysisDir, "topics", "index.json"))}`,
    `control-run-history:${getPathSignature(path.join(controlDir, "run-history.json"))}`,
    `control-scheduler:${getPathSignature(path.join(controlDir, "scheduler.json"))}`
  ].join("||");
}

export function getReadModelCacheKey(): string {
  return computeDashboardDataCacheKey();
}

const X_AUTH_FAILURE_TASKS = new Set<RunHistoryEntry["task"]>([
  "crawl_x_api",
  "capture_priority_accounts",
  "capture_x_api_timeline",
  "capture_x_api_tweet",
  "capture_x_api_tweet_and_compose_replies"
]);

const X_AUTH_FAILURE_PATTERNS = [
  /home timeline access needs a user-context token/i,
  /application-only/i,
  /x_bearer_token/i,
  /oauth/i,
  /token exchange failed/i,
  /failed to refresh x auth/i,
  /unauthorized/i
];

function readTextFile(filePath: string): string | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath, "utf8");
}

function readTailLines(text: string, maxLines: number): string {
  const lines = text.trim().split("\n");
  return lines.slice(Math.max(0, lines.length - maxLines)).join("\n");
}

export function detectLatestXAuthWarning(runHistory: RunHistoryEntry[]): DashboardData["xAuthWarning"] {
  const activeXAuth = readXAuthRecord();

  for (const entry of runHistory) {
    if (entry.status !== "failed" || !X_AUTH_FAILURE_TASKS.has(entry.task)) {
      continue;
    }

    const failedAt = Date.parse(entry.startedAt);
    const hasLaterSuccessfulXRun = runHistory.some((candidate) => {
      if (!X_AUTH_FAILURE_TASKS.has(candidate.task) || candidate.status !== "completed") {
        return false;
      }

      const candidateCompletedAt = candidate.completedAt ? Date.parse(candidate.completedAt) : Number.NaN;
      return Number.isFinite(candidateCompletedAt) && Number.isFinite(failedAt) && candidateCompletedAt > failedAt;
    });
    if (hasLaterSuccessfulXRun) {
      return null;
    }

    const authObtainedAt = activeXAuth?.obtainedAt ? Date.parse(activeXAuth.obtainedAt) : Number.NaN;
    if (activeXAuth?.accessToken && Number.isFinite(authObtainedAt) && Number.isFinite(failedAt) && authObtainedAt > failedAt) {
      return null;
    }

    const logText = readTextFile(path.join(projectRoot, entry.logPath));
    const combinedText = `${entry.errorMessage ?? ""}\n${readTailLines(logText ?? "", 40)}`;
    if (!X_AUTH_FAILURE_PATTERNS.some((pattern) => pattern.test(combinedText))) {
      continue;
    }

    let reason =
      "The latest X pull failed before capture finished. Review the X auth setup in Control, refresh the account if needed, then retry the pull.";
    if (/user-context token|application-only/i.test(combinedText)) {
      reason =
        "The latest X pull is using an app-only token. Replace X_BEARER_TOKEN with a user-context token, or connect X in Control so crawls can use reverse chronological timeline access.";
    } else if (/failed to refresh x auth|oauth|token exchange failed/i.test(combinedText)) {
      reason = "The latest X pull could not validate the saved X auth session. Reconnect the account, then retry.";
    }

    return {
      runControlId: entry.runControlId,
      task: entry.task,
      startedAt: entry.startedAt,
      logPath: entry.logPath,
      reason
    };
  }

  return null;
}

export function invalidateDashboardDataCache(): void {
  dashboardDataCache = null;
  lightweightUsageDataCache = null;
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
  usageSyncStatusMap?: Map<string, MediaAssetSyncStatus>;
  assetStarredMap?: Map<string, boolean>;
  topicLabelsByTweetKey?: Map<string, string[]>;
  topTopicByTweetKey?: Map<string, { label: string | null; hotnessScore: number }>;
  priorityAuthorUsernames?: Set<string>;
}): CapturedTweetRecord[] {
  return input.tweets.map((tweet) => {
    const relativeEngagementScore = computeRelativeEngagementScore({ tweet });
    const firstUsageId = tweet.media[0] ? buildUsageId(tweet, 0) : null;
    const firstMediaAssetId = firstUsageId ? input.usageToAssetIdMap?.get(firstUsageId) ?? null : null;
    const tweetKey = buildTweetKey(tweet);
    const topTopic = input.topTopicByTweetKey?.get(tweetKey);
    const usageStatuses = tweet.media.map((_media, mediaIndex) => {
      const usageId = buildUsageId(tweet, mediaIndex);
      return input.usageSyncStatusMap?.get(usageId) ?? "missing";
    });
    const indexedMediaCount = usageStatuses.filter((status) => status === "indexed").length;
    const staleMediaCount = usageStatuses.filter((status) => status === "stale").length;
    const missingMediaCount = usageStatuses.filter((status) => status === "missing").length;
    const mediaAssetSyncStatus: MediaAssetSyncStatus = !tweet.media.length
      ? "not_applicable"
      : missingMediaCount > 0
        ? "missing"
        : staleMediaCount > 0
          ? "stale"
          : "indexed";

    return {
      tweetKey,
      tweet,
      isPriorityAccount: (() => {
        const normalizedAuthorUsername = normalizeAuthorUsername(tweet.authorUsername);
        return normalizedAuthorUsername ? input.priorityAuthorUsernames?.has(normalizedAuthorUsername) ?? false : false;
      })(),
      hasMedia: tweet.media.length > 0,
      mediaCount: tweet.media.length,
      analyzedMediaCount: tweet.media.reduce((count, _media, mediaIndex) => {
        const usageId = buildUsageId(tweet, mediaIndex);
        return count + (input.analysisMap.get(usageId)?.status === "complete" ? 1 : 0);
      }, 0),
      indexedMediaCount,
      staleMediaCount,
      missingMediaCount,
      mediaAssetSyncStatus,
      firstMediaAssetId,
      firstMediaAssetStarred: firstMediaAssetId ? input.assetStarredMap?.get(firstMediaAssetId) ?? false : false,
      topicLabels: input.topicLabelsByTweetKey?.get(tweetKey) ?? [],
      topTopicLabel: topTopic?.label ?? null,
      topTopicHotnessScore: topTopic?.hotnessScore ?? 0,
      relativeEngagementScore,
      relativeEngagementBand: classifyRelativeEngagementBand(relativeEngagementScore)
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

function normalizeUsageMatchFilter(value: string | null | undefined): UsageMatchFilter {
  switch (value) {
    case "matched":
    case "phash":
    case "starred":
    case "starred_or_duplicates":
    case "all":
      return value;
    default:
      return "all";
  }
}

function normalizeUsageSort(value: string | null | undefined): UsageSort {
  switch (value) {
    case "newest_desc":
    case "newest_asc":
    case "duplicates_desc":
    case "duplicates_asc":
    case "hotness_desc":
    case "hotness_asc":
      return value;
    case "duplicates":
      return "duplicates_desc";
    case "hotness":
      return "hotness_desc";
    case "newest":
      return "newest_desc";
    default:
      return "newest_desc";
  }
}

function normalizeUsageQuery(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function normalizeUsageHideDuplicateAssets(value: string | null | undefined, defaultValue = true): boolean {
  if (value === "0") {
    return false;
  }

  if (value === "1") {
    return true;
  }

  return defaultValue;
}

function normalizeUsageRepeatMinimum(value: number | string | null | undefined, defaultValue = 2): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.max(2, Math.floor(parsed));
}

function matchesStarredOrRepeatedFilter(usage: TweetUsageRecord, repeatMinimum: number): boolean {
  return usage.mediaAssetStarred || usage.duplicateGroupUsageCount >= repeatMinimum;
}

function matchesRepeatedFilter(usage: TweetUsageRecord, repeatMinimum: number): boolean {
  return usage.duplicateGroupUsageCount >= repeatMinimum;
}

function matchesUsageFilter(usage: TweetUsageRecord, matchFilter: UsageMatchFilter, repeatMinimum = 2): boolean {
  switch (matchFilter) {
    case "matched":
      return matchesRepeatedFilter(usage, repeatMinimum);
    case "phash":
      return usage.phashMatchCount > 0;
    case "starred":
      return usage.mediaAssetStarred;
    case "starred_or_duplicates":
      return matchesStarredOrRepeatedFilter(usage, repeatMinimum);
    case "all":
    default:
      return true;
  }
}

function matchesUsageQuery(usage: TweetUsageRecord, normalizedQuery: string): boolean {
  if (!normalizedQuery) {
    return true;
  }

  return [
    usage.tweet.authorUsername,
    usage.tweet.text,
    usage.analysis.status,
    usage.analysis.caption_brief,
    usage.analysis.scene_description
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

function compareUsages(
  left: TweetUsageRecord,
  right: TweetUsageRecord,
  sortOrder: UsageSort
): number {
  if (sortOrder === "duplicates_desc" && left.duplicateGroupUsageCount !== right.duplicateGroupUsageCount) {
    return right.duplicateGroupUsageCount - left.duplicateGroupUsageCount;
  }

  if (sortOrder === "duplicates_asc" && left.duplicateGroupUsageCount !== right.duplicateGroupUsageCount) {
    return left.duplicateGroupUsageCount - right.duplicateGroupUsageCount;
  }

  if (sortOrder === "hotness_desc" && left.hotnessScore !== right.hotnessScore) {
    return right.hotnessScore - left.hotnessScore;
  }

  if (sortOrder === "hotness_asc" && left.hotnessScore !== right.hotnessScore) {
    return left.hotnessScore - right.hotnessScore;
  }

  if (getUsageTimestampMs(left) !== getUsageTimestampMs(right)) {
    return sortOrder === "newest_asc"
      ? getUsageTimestampMs(left) - getUsageTimestampMs(right)
      : getUsageTimestampMs(right) - getUsageTimestampMs(left);
  }

  if (left.duplicateGroupUsageCount !== right.duplicateGroupUsageCount) {
    return right.duplicateGroupUsageCount - left.duplicateGroupUsageCount;
  }

  if (left.hotnessScore !== right.hotnessScore) {
    return right.hotnessScore - left.hotnessScore;
  }

  return left.usageId.localeCompare(right.usageId);
}

function getTopicMostRecentTimestampMs(topic: TopicClusterRecord): number {
  const parsed = topic.mostRecentAt ? Date.parse(topic.mostRecentAt) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function getTopicOldestTimestampMs(topic: TopicClusterRecord): number {
  const parsed = topic.oldestAt ? Date.parse(topic.oldestAt) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTopicClusterQuery(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function normalizeTopicClusterSort(value: string | null | undefined): TopicClusterSort {
  switch (value) {
    case "hotness_desc":
    case "hotness_asc":
    case "newest_desc":
    case "newest_asc":
    case "tweets_desc":
    case "tweets_asc":
    case "likes_desc":
    case "likes_asc":
    case "recent_24h_desc":
    case "recent_24h_asc":
      return value;
    case "hotness":
      return "hotness_desc";
    case "newest":
      return "newest_desc";
    case "oldest":
      return "newest_asc";
    case "tweets":
      return "tweets_desc";
    case "likes":
      return "likes_desc";
    case "recent_24h":
      return "recent_24h_desc";
    default:
      return "hotness_desc";
  }
}

function normalizeTopicClusterFreshness(value: string | null | undefined): TopicClusterFreshnessFilter {
  switch (value) {
    case "fresh":
    case "active_24h":
    case "active_72h":
    case "stale":
      return value;
    default:
      return "all";
  }
}

function normalizeTopicClusterKind(value: string | null | undefined): TopicClusterKindFilter {
  switch (value) {
    case "entity":
    case "cashtag":
    case "hashtag":
    case "phrase":
    case "reference":
    case "brand":
    case "intent":
      return value;
    default:
      return "all";
  }
}

function matchesTopicClusterQuery(topic: TopicClusterRecord, normalizedQuery: string): boolean {
  if (!normalizedQuery) {
    return true;
  }

  return [
    topic.label,
    topic.normalizedLabel,
    topic.kind,
    ...topic.suggestedAngles,
    ...topic.representativeTweets.map((tweet) => tweet.authorUsername ?? ""),
    ...topic.representativeTweets.map((tweet) => tweet.text ?? "")
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

function matchesTopicClusterFreshness(
  topic: TopicClusterRecord,
  freshness: TopicClusterFreshnessFilter,
  nowMs: number
): boolean {
  const mostRecentTimestampMs = getTopicMostRecentTimestampMs(topic);
  const ageMs = mostRecentTimestampMs > 0 ? Math.max(0, nowMs - mostRecentTimestampMs) : Number.POSITIVE_INFINITY;

  switch (freshness) {
    case "fresh":
      return !topic.isStale;
    case "active_24h":
      return ageMs <= 24 * 60 * 60 * 1000;
    case "active_72h":
      return ageMs <= 72 * 60 * 60 * 1000;
    case "stale":
      return topic.isStale;
    default:
      return true;
  }
}

function matchesTopicClusterKind(topic: TopicClusterRecord, kind: TopicClusterKindFilter): boolean {
  return kind === "all" ? true : topic.kind === kind;
}

function compareTopicClusters(left: TopicClusterRecord, right: TopicClusterRecord, sort: TopicClusterSort): number {
  switch (sort) {
    case "newest_desc":
      return (
        getTopicMostRecentTimestampMs(right) - getTopicMostRecentTimestampMs(left) ||
        right.hotnessScore - left.hotnessScore ||
        left.label.localeCompare(right.label)
      );
    case "newest_asc":
      return (
        getTopicMostRecentTimestampMs(left) - getTopicMostRecentTimestampMs(right) ||
        getTopicOldestTimestampMs(left) - getTopicOldestTimestampMs(right) ||
        left.label.localeCompare(right.label)
      );
    case "tweets_desc":
      return right.tweetCount - left.tweetCount || right.hotnessScore - left.hotnessScore || left.label.localeCompare(right.label);
    case "tweets_asc":
      return left.tweetCount - right.tweetCount || getTopicMostRecentTimestampMs(right) - getTopicMostRecentTimestampMs(left) || left.label.localeCompare(right.label);
    case "likes_desc":
      return right.totalLikes - left.totalLikes || right.hotnessScore - left.hotnessScore || left.label.localeCompare(right.label);
    case "likes_asc":
      return left.totalLikes - right.totalLikes || getTopicMostRecentTimestampMs(right) - getTopicMostRecentTimestampMs(left) || left.label.localeCompare(right.label);
    case "recent_24h_desc":
      return (
        right.recentTweetCount24h - left.recentTweetCount24h ||
        getTopicMostRecentTimestampMs(right) - getTopicMostRecentTimestampMs(left) ||
        right.hotnessScore - left.hotnessScore ||
        left.label.localeCompare(right.label)
      );
    case "recent_24h_asc":
      return (
        left.recentTweetCount24h - right.recentTweetCount24h ||
        getTopicMostRecentTimestampMs(right) - getTopicMostRecentTimestampMs(left) ||
        right.hotnessScore - left.hotnessScore ||
        left.label.localeCompare(right.label)
      );
    case "hotness_asc":
      return (
        left.hotnessScore - right.hotnessScore ||
        getTopicMostRecentTimestampMs(left) - getTopicMostRecentTimestampMs(right) ||
        left.tweetCount - right.tweetCount ||
        left.label.localeCompare(right.label)
      );
    case "hotness_desc":
    default:
      return (
        right.hotnessScore - left.hotnessScore ||
        getTopicMostRecentTimestampMs(right) - getTopicMostRecentTimestampMs(left) ||
        right.tweetCount - left.tweetCount ||
        left.label.localeCompare(right.label)
      );
  }
}

export function classifyMediaAssetSyncStatus(input: {
  hasMedia: boolean;
  mediaAssetId: string | null;
  extractedAt: string | null | undefined;
  assetIndexGeneratedAt: string | null | undefined;
}): MediaAssetSyncStatus {
  if (!input.hasMedia) {
    return "not_applicable";
  }

  if (!input.mediaAssetId) {
    return "missing";
  }

  const extractedAtMs = input.extractedAt ? Date.parse(input.extractedAt) : Number.NaN;
  const assetIndexGeneratedAtMs = input.assetIndexGeneratedAt ? Date.parse(input.assetIndexGeneratedAt) : Number.NaN;
  if (Number.isFinite(extractedAtMs) && Number.isFinite(assetIndexGeneratedAtMs) && extractedAtMs > assetIndexGeneratedAtMs) {
    return "stale";
  }

  return "indexed";
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

function normalizeCapturedTweetSort(value: string | null | undefined): CapturedTweetSort {
  switch (value) {
    case "newest_asc":
      return "newest_asc";
    case "newest":
      return "newest_desc";
    default:
      return "newest_desc";
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
  sort?: string | null;
}): CapturedTweetPage {
  const normalizedQuery = normalizeCapturedTweetQuery(input.query);
  const normalizedQueryLower = normalizedQuery.toLowerCase();
  const tweetFilter = normalizeCapturedTweetFilter(input.tweetFilter);
  const sort = normalizeCapturedTweetSort(input.sort);
  const pageSize = Math.min(MAX_CAPTURED_TWEET_PAGE_SIZE, Math.max(1, Math.floor(input.pageSize ?? CAPTURED_TWEET_PAGE_SIZE)));
  const queryMatches = input.tweets
    .filter((entry) => matchesCapturedTweetQuery(entry, normalizedQueryLower))
    .sort((left, right) =>
      sort === "newest_asc"
        ? getCapturedTweetTimestampMs(left) - getCapturedTweetTimestampMs(right)
        : getCapturedTweetTimestampMs(right) - getCapturedTweetTimestampMs(left)
    );
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
    sort,
    counts
  };
}

export function getUsagePage(input: {
  usages: TweetUsageRecord[];
  page?: number;
  pageSize?: number;
  query?: string | null;
  matchFilter?: string | null;
  repeatMinimum?: number | string | null;
  sort?: string | null;
  hideDuplicateAssets?: string | null;
  defaultMatchFilter?: UsageMatchFilter;
  defaultHideDuplicateAssets?: boolean;
}): UsagePage {
  const normalizedQuery = normalizeUsageQuery(input.query);
  const normalizedQueryLower = normalizedQuery.toLowerCase();
  const matchFilter = normalizeUsageMatchFilter(input.matchFilter ?? input.defaultMatchFilter);
  const repeatMinimum = normalizeUsageRepeatMinimum(input.repeatMinimum);
  const sort = normalizeUsageSort(input.sort);
  const hideDuplicateAssets = normalizeUsageHideDuplicateAssets(input.hideDuplicateAssets, input.defaultHideDuplicateAssets ?? true);
  const pageSize = Math.min(MAX_USAGE_PAGE_SIZE, Math.max(1, Math.floor(input.pageSize ?? USAGE_PAGE_SIZE)));

  const queryMatches = input.usages.filter((usage) => matchesUsageQuery(usage, normalizedQueryLower));
  const counts = {
    all: queryMatches.length,
    matched: queryMatches.filter((usage) => matchesUsageFilter(usage, "matched", repeatMinimum)).length,
    phash: queryMatches.filter((usage) => matchesUsageFilter(usage, "phash", repeatMinimum)).length,
    starred: queryMatches.filter((usage) => matchesUsageFilter(usage, "starred", repeatMinimum)).length,
    starred_or_duplicates: queryMatches.filter((usage) => matchesUsageFilter(usage, "starred_or_duplicates", repeatMinimum)).length
  } satisfies Record<UsageMatchFilter, number>;
  const filteredUsages = queryMatches.filter((usage) => matchesUsageFilter(usage, matchFilter, repeatMinimum));
  const sortedUsages = [...filteredUsages].sort((left, right) => compareUsages(left, right, sort));
  const visibleUsages = hideDuplicateAssets
    ? Array.from(
        sortedUsages.reduce((map, usage) => {
          const duplicateKey = usage.duplicateGroupId ?? usage.mediaAssetId ?? usage.usageId;
          if (!map.has(duplicateKey)) {
            map.set(duplicateKey, usage);
          }

          return map;
        }, new Map<string, TweetUsageRecord>()).values()
      )
    : sortedUsages;
  const totalResults = visibleUsages.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const page = Math.min(Math.max(1, Math.floor(input.page ?? 1)), totalPages);
  const startIndex = (page - 1) * pageSize;

  return {
    usages: visibleUsages.slice(startIndex, startIndex + pageSize),
    page,
    pageSize,
    totalResults,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
    query: normalizedQuery,
    matchFilter,
    repeatMinimum,
    sort,
    hideDuplicateAssets,
    counts
  };
}

export function getTopicClusterPage(input: {
  topics: TopicClusterRecord[];
  page?: number;
  pageSize?: number;
  query?: string | null;
  sort?: string | null;
  freshness?: string | null;
  kind?: string | null;
  nowMs?: number;
}): TopicClusterPage {
  const normalizedQuery = normalizeTopicClusterQuery(input.query);
  const normalizedQueryLower = normalizedQuery.toLowerCase();
  const sort = normalizeTopicClusterSort(input.sort);
  const freshness = normalizeTopicClusterFreshness(input.freshness);
  const kind = normalizeTopicClusterKind(input.kind);
  const nowMs = input.nowMs ?? Date.now();
  const pageSize = Math.min(MAX_TOPIC_CLUSTER_PAGE_SIZE, Math.max(1, Math.floor(input.pageSize ?? TOPIC_CLUSTER_PAGE_SIZE)));

  const queryMatches = input.topics.filter((topic) => matchesTopicClusterQuery(topic, normalizedQueryLower));
  const counts = {
    all: queryMatches.length,
    fresh: queryMatches.filter((topic) => matchesTopicClusterFreshness(topic, "fresh", nowMs)).length,
    active_24h: queryMatches.filter((topic) => matchesTopicClusterFreshness(topic, "active_24h", nowMs)).length,
    active_72h: queryMatches.filter((topic) => matchesTopicClusterFreshness(topic, "active_72h", nowMs)).length,
    stale: queryMatches.filter((topic) => matchesTopicClusterFreshness(topic, "stale", nowMs)).length
  } satisfies Record<TopicClusterFreshnessFilter, number>;
  const filteredTopics = queryMatches
    .filter((topic) => matchesTopicClusterFreshness(topic, freshness, nowMs))
    .filter((topic) => matchesTopicClusterKind(topic, kind))
    .sort((left, right) => compareTopicClusters(left, right, sort));
  const totalResults = filteredTopics.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const page = Math.min(Math.max(1, Math.floor(input.page ?? 1)), totalPages);
  const startIndex = (page - 1) * pageSize;

  return {
    topics: filteredTopics.slice(startIndex, startIndex + pageSize),
    page,
    pageSize,
    totalResults,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
    query: normalizedQuery,
    sort,
    freshness,
    kind,
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
  const cacheKey = computeDashboardDataCacheKey();
  if (dashboardDataCache?.key === cacheKey) {
    return dashboardDataCache.value;
  }

  const manifests = loadCrawlManifests();
  const priorityAuthorUsernames = listPriorityAccountUsernames();
  const schedulerConfig = readSchedulerConfig();
  const runHistory = readRunHistory();
  const xAuthWarning = detectLatestXAuthWarning(runHistory);
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
  const sourceTweets = mergeSourceTweets(manifests);
  const tweetUsages = buildPendingAnalyses(sourceTweets).map((usage) => {
    const mediaAssetId = assetIndex?.usageToAssetId[usage.usageId] ?? null;
    const preferredVideoAnalysis = mediaAssetId ? assetVideoAnalysisMap.get(mediaAssetId) ?? null : null;
    const savedAnalysis = analysisMap.get(buildUsageId(usage.tweet, usage.mediaIndex)) ?? usage.analysis;

    const usageRecord: TweetUsageRecord = {
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

    return usageRecord;
  });
  const assetUsageCountMap = buildAssetUsageCountMap(assetIndex?.assets);
  const assetLocalFilePathMap = new Map((assetIndex?.assets ?? []).map((asset) => [asset.assetId, asset.canonicalFilePath]));
  const assetPlayableFilePathMap = new Map((assetIndex?.assets ?? []).map((asset) => [asset.assetId, asset.promotedVideoFilePath]));
  const assetStarredMap = new Map((assetIndex?.assets ?? []).map((asset) => [asset.assetId, asset.starred]));
  const usageToAssetIdMap = new Map(Object.entries(assetIndex?.usageToAssetId ?? {}));
  const assetIndexGeneratedAt = assetIndex?.generatedAt ?? null;
  const phashMatchMap = assetIndex ? buildPhashMatchMap({ assets: assetIndex.assets, usages: tweetUsages }) : {};
  const duplicateGroupMap = assetIndex
    ? buildDuplicateGroupMap({ assets: assetIndex.assets, usages: tweetUsages, phashMatchMap })
    : {};
  const hotnessScoreByUsageId = buildHotnessScoreByUsageId({
    usages: tweetUsages,
    duplicateGroupMap
  });
  const usageSyncStatusMap = new Map(
    tweetUsages.map((usage) => [
      usage.usageId,
      classifyMediaAssetSyncStatus({
        hasMedia: true,
        mediaAssetId: usage.mediaAssetId,
        extractedAt: usage.tweet.extraction.extractedAt,
        assetIndexGeneratedAt
      })
    ])
  );
  const enrichedUsages = tweetUsages.map((usage) => {
    const assetId = usage.mediaAssetId;
    const duplicateGroup = duplicateGroupMap[usage.usageId];
    const mediaAssetSyncStatus = usageSyncStatusMap.get(usage.usageId) ?? "missing";
    return {
      ...usage,
      mediaLocalFilePath: assetId ? assetLocalFilePathMap.get(assetId) ?? null : null,
      mediaPlayableFilePath: assetId ? assetPlayableFilePathMap.get(assetId) ?? null : null,
      mediaAssetStarred: assetId ? assetStarredMap.get(assetId) ?? false : false,
      mediaAssetUsageCount: assetId ? assetUsageCountMap.get(assetId) ?? 0 : 0,
      phashMatchCount: assetId ? phashMatchMap[assetId]?.length ?? 0 : 0,
      duplicateGroupId: duplicateGroup?.groupId ?? assetId ?? usage.usageId,
      duplicateGroupUsageCount: duplicateGroup?.usageIds.length ?? (assetId ? assetUsageCountMap.get(assetId) ?? 1 : 1),
      mediaAssetSyncStatus,
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
    usageSyncStatusMap,
    assetStarredMap,
    topicLabelsByTweetKey,
    topTopicByTweetKey,
    priorityAuthorUsernames
  });

  const value = {
    manifests,
    schedulerConfig,
    runHistory,
    xAuthWarning,
    totalTweetCount: sourceTweets.length,
    capturedTweets,
    tweetUsages: enrichedUsages,
    topicIndex,
    topicClusters: topicIndex.topics,
    replyMediaWishlist
  };

  dashboardDataCache = {
    key: cacheKey,
    value
  };

  return value;
}

function buildLightweightUsageData(): TweetUsageRecord[] {
  const manifests = loadCrawlManifests();
  const savedAnalyses = readAllUsageAnalyses();
  const assetVideoAnalyses = readAllAssetVideoAnalyses();
  const assetIndex = readMediaAssetIndex();
  const analysisMap = new Map(savedAnalyses.map((analysis) => [analysis.usageId, analysis]));
  const assetVideoAnalysisMap = new Map(
    assetVideoAnalyses
      .filter((analysis) => analysis.status === "complete")
      .map((analysis) => [analysis.usageId.replace("::video", ""), analysis])
  );
  const sourceTweets = mergeSourceTweets(manifests);
  const baseUsages = buildPendingAnalyses(sourceTweets);
  const assetUsageCountMap = buildAssetUsageCountMap(assetIndex?.assets);
  const assetLocalFilePathMap = new Map((assetIndex?.assets ?? []).map((asset) => [asset.assetId, asset.canonicalFilePath]));
  const assetPlayableFilePathMap = new Map((assetIndex?.assets ?? []).map((asset) => [asset.assetId, asset.promotedVideoFilePath]));
  const assetStarredMap = new Map((assetIndex?.assets ?? []).map((asset) => [asset.assetId, asset.starred]));
  const usageToAssetIdMap = new Map(Object.entries(assetIndex?.usageToAssetId ?? {}));
  const assetIndexGeneratedAt = assetIndex?.generatedAt ?? null;
  const phashMatchMap = assetIndex ? buildPhashMatchMap({ assets: assetIndex.assets, usages: baseUsages }) : {};
  const duplicateGroupMap = assetIndex
    ? buildDuplicateGroupMap({ assets: assetIndex.assets, usages: baseUsages, phashMatchMap })
    : {};

  const usages = baseUsages.map((usage) => {
    const mediaAssetId = usageToAssetIdMap.get(usage.usageId) ?? null;
    const preferredVideoAnalysis = mediaAssetId ? assetVideoAnalysisMap.get(mediaAssetId) ?? null : null;
    const savedAnalysis = analysisMap.get(usage.usageId) ?? usage.analysis;
    const mediaAssetUsageCount = mediaAssetId ? assetUsageCountMap.get(mediaAssetId) ?? 0 : 0;
    const duplicateGroup = duplicateGroupMap[usage.usageId];

    return {
      ...usage,
      analysis: preferredVideoAnalysis
        ? materializeUsageAnalysisFromAssetVideo(preferredVideoAnalysis, usage)
        : savedAnalysis,
      mediaAssetId,
      mediaLocalFilePath: mediaAssetId ? assetLocalFilePathMap.get(mediaAssetId) ?? null : null,
      mediaPlayableFilePath: mediaAssetId ? assetPlayableFilePathMap.get(mediaAssetId) ?? null : null,
      mediaAssetStarred: mediaAssetId ? assetStarredMap.get(mediaAssetId) ?? false : false,
      mediaAssetUsageCount,
      mediaAssetSyncStatus: classifyMediaAssetSyncStatus({
        hasMedia: true,
        mediaAssetId,
        extractedAt: usage.tweet.extraction.extractedAt,
        assetIndexGeneratedAt
      }),
      phashMatchCount: mediaAssetId ? phashMatchMap[mediaAssetId]?.length ?? 0 : 0,
      duplicateGroupId: duplicateGroup?.groupId ?? mediaAssetId ?? usage.usageId,
      duplicateGroupUsageCount: duplicateGroup?.usageIds.length ?? Math.max(1, mediaAssetUsageCount),
      hotnessScore: 0
    };
  });

  const hotnessScoreByUsageId = buildHotnessScoreByUsageId({
    usages,
    duplicateGroupMap
  });

  return usages.map((usage) => ({
    ...usage,
    hotnessScore: hotnessScoreByUsageId.get(usage.usageId) ?? 0
  }));
}

export function getLightweightUsageData(): TweetUsageRecord[] {
  const cacheKey = computeDashboardDataCacheKey();
  if (lightweightUsageDataCache?.key === cacheKey) {
    return lightweightUsageDataCache.value;
  }

  const value = buildLightweightUsageData();
  lightweightUsageDataCache = {
    key: cacheKey,
    value
  };
  return value;
}

export function getDashboardOverviewData(): DashboardOverviewData {
  const manifests = loadCrawlManifests();
  const runHistory = readRunHistory();
  const xAuthWarning = detectLatestXAuthWarning(runHistory);
  const replyMediaWishlist = readReplyMediaWishlist();
  const savedAnalyses = readAllUsageAnalyses();
  const assetVideoAnalyses = readAllAssetVideoAnalyses();
  const assetIndex = readMediaAssetIndex();
  const topicIndex = readTopicIndex() ?? emptyTopicIndex(0);

  const sourceTweets = mergeSourceTweets(manifests);
  const totalTweetCount = sourceTweets.length;
  const textOnlyTweetCount = sourceTweets.filter((tweet) => tweet.media.length === 0).length;
  const tweetsWithMediaCount = totalTweetCount - textOnlyTweetCount;
  const totalUsageCount = sourceTweets.reduce((sum, tweet) => sum + tweet.media.length, 0);

  const analysisMap = new Map(savedAnalyses.map((analysis) => [analysis.usageId, analysis]));
  const assetVideoAnalysisMap = new Map(
    assetVideoAnalyses
      .filter((analysis) => analysis.status === "complete")
      .map((analysis) => [analysis.usageId.replace("::video", ""), analysis])
  );
  const assetUsageCountMap = buildAssetUsageCountMap(assetIndex?.assets);
  const assetStarredMap = new Map((assetIndex?.assets ?? []).map((asset) => [asset.assetId, asset.starred]));
  const usageToAssetIdMap = new Map(Object.entries(assetIndex?.usageToAssetId ?? {}));
  const assetIndexGeneratedAt = assetIndex?.generatedAt ?? null;

  let completedUsageCount = 0;
  let starredUsageCount = 0;
  let repeatedAssetUsageCount = 0;
  let indexedAssetUsageCount = 0;
  let staleAssetUsageCount = 0;
  let missingAssetUsageCount = 0;

  for (const tweet of sourceTweets) {
    for (let mediaIndex = 0; mediaIndex < tweet.media.length; mediaIndex += 1) {
      const usageId = buildUsageId(tweet, mediaIndex);
      const mediaAssetId = usageToAssetIdMap.get(usageId) ?? null;
      const preferredVideoAnalysis = mediaAssetId ? assetVideoAnalysisMap.get(mediaAssetId) ?? null : null;
      const savedAnalysis = analysisMap.get(usageId) ?? null;
      if (preferredVideoAnalysis || savedAnalysis?.status === "complete") {
        completedUsageCount += 1;
      }

      if (mediaAssetId && assetStarredMap.get(mediaAssetId)) {
        starredUsageCount += 1;
      }

      if (mediaAssetId && (assetUsageCountMap.get(mediaAssetId) ?? 0) > 1) {
        repeatedAssetUsageCount += 1;
      }

      const syncStatus = classifyMediaAssetSyncStatus({
        hasMedia: true,
        mediaAssetId,
        extractedAt: tweet.extraction.extractedAt,
        assetIndexGeneratedAt
      });
      if (syncStatus === "indexed") {
        indexedAssetUsageCount += 1;
      } else if (syncStatus === "stale") {
        staleAssetUsageCount += 1;
      } else if (syncStatus === "missing") {
        missingAssetUsageCount += 1;
      }
    }
  }

  return {
    manifests,
    runHistory,
    xAuthWarning,
    totalTweetCount,
    tweetsWithMediaCount,
    textOnlyTweetCount,
    totalUsageCount,
    completedUsageCount,
    pendingUsageCount: Math.max(0, totalUsageCount - completedUsageCount),
    repeatedAssetUsageCount,
    starredUsageCount,
    indexedAssetUsageCount,
    staleAssetUsageCount,
    missingAssetUsageCount,
    topicClusters: topicIndex.topics,
    replyMediaWishlist
  };
}

export function getTopicPageData(): TopicPageData {
  const topicIndex = readTopicIndex() ?? emptyTopicIndex(0);
  return {
    topicIndex,
    topicClusters: topicIndex.topics
  };
}

export function getCapturedTweetData(): CapturedTweetData {
  const manifests = loadCrawlManifests();
  const priorityAuthorUsernames = listPriorityAccountUsernames();
  const sourceTweets = mergeSourceTweets(manifests);
  const savedAnalyses = readAllUsageAnalyses();
  const assetIndex = readMediaAssetIndex();
  const analysisMap = new Map(savedAnalyses.map((analysis) => [analysis.usageId, analysis]));
  const usageToAssetIdMap = new Map(Object.entries(assetIndex?.usageToAssetId ?? {}));
  const assetStarredMap = new Map((assetIndex?.assets ?? []).map((asset) => [asset.assetId, asset.starred]));
  const assetIndexGeneratedAt = assetIndex?.generatedAt ?? null;
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
  const usageSyncStatusMap = new Map<string, MediaAssetSyncStatus>();
  for (const tweet of sourceTweets) {
    for (let mediaIndex = 0; mediaIndex < tweet.media.length; mediaIndex += 1) {
      const usageId = buildUsageId(tweet, mediaIndex);
      usageSyncStatusMap.set(
        usageId,
        classifyMediaAssetSyncStatus({
          hasMedia: true,
          mediaAssetId: usageToAssetIdMap.get(usageId) ?? null,
          extractedAt: tweet.extraction.extractedAt,
          assetIndexGeneratedAt
        })
      );
    }
  }

  return {
    totalTweetCount: sourceTweets.length,
    capturedTweets: buildCapturedTweetRecords({
      tweets: sourceTweets,
      analysisMap,
      usageToAssetIdMap,
      usageSyncStatusMap,
      assetStarredMap,
      topicLabelsByTweetKey,
      topTopicByTweetKey,
      priorityAuthorUsernames
    })
  };
}

export function getControlPageData(): ControlPageData {
  const manifests = loadCrawlManifests();
  const schedulerConfig = readSchedulerConfig();
  const runHistory = readRunHistory();

  return {
    manifests,
    schedulerConfig,
    runHistory,
    xAuthWarning: detectLatestXAuthWarning(runHistory)
  };
}

export function getWishlistPageData(): WishlistPageData {
  return {
    replyMediaWishlist: readReplyMediaWishlist()
  };
}

export function getUsageDetailData(usageId: string): UsageDetailData {
  const usages = getLightweightUsageData();

  return {
    usage: usages.find((item) => item.usageId === usageId) ?? null,
    usages
  };
}
