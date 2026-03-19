export type MediaKind = "image" | "video" | "video_hls" | "video_blob";
export type InterceptedMediaClass = "image" | "video" | "video_poster";

export interface TweetMetrics {
  replies: string | null;
  reposts: string | null;
  likes: string | null;
  bookmarks: string | null;
  views: string | null;
}

export type RelativeEngagementBand = "baseline" | "strong" | "breakout";

export interface TweetMedia {
  mediaKind: MediaKind;
  sourceUrl: string | null;
  previewUrl: string | null;
  posterUrl: string | null;
}

export interface MediaFingerprint {
  algorithm: "dhash_8x8";
  hex: string | null;
  bitLength: number;
  width: number | null;
  height: number | null;
}

export interface MediaSimilarityEmbedding {
  model: string;
  outputDimensionality: number;
  taskType: "SEMANTIC_SIMILARITY";
  modality: "image";
  normalized: boolean;
  values: number[];
}

export interface ExtractedTweet {
  sourceName: string;
  tweetId: string | null;
  tweetUrl: string | null;
  authorUserId?: string | null;
  authorHandle: string | null;
  authorUsername: string | null;
  authorDisplayName: string | null;
  authorProfileImageUrl: string | null;
  authorFollowerCount?: number | null;
  createdAt: string | null;
  text: string | null;
  metrics: TweetMetrics;
  media: TweetMedia[];
  extraction: {
    articleIndex: number;
    extractedAt: string;
  };
}

export interface InterceptedMediaRecord {
  url: string;
  mediaClass: InterceptedMediaClass;
  persisted: boolean;
  contentType: string | null;
  filePath?: string;
}

export interface CrawlManifest {
  runId: string;
  startedAt: string;
  completedAt?: string;
  baseUrl: string;
  maxScrolls: number;
  downloadImages: boolean;
  downloadVideoPosters: boolean;
  downloadVideos: boolean;
  capturedTweets: ExtractedTweet[];
  interceptedMedia: InterceptedMediaRecord[];
}

export interface UsageAnalysis {
  usageId: string;
  tweetId: string | null;
  mediaIndex: number;
  mediaKind: MediaKind;
  status: "pending" | "complete";
  has_celebrity: boolean | null;
  has_human_face: boolean | null;
  features_female: boolean | null;
  features_male: boolean | null;
  has_screenshot_ui: boolean | null;
  has_text_overlay: boolean | null;
  has_chart_or_graph: boolean | null;
  has_logo_or_watermark: boolean | null;
  caption_brief: string | null;
  scene_description: string | null;
  ocr_text: string | null;
  primary_subjects: string[];
  secondary_subjects: string[];
  visible_objects: string[];
  setting_context: string | null;
  action_or_event: string | null;
  video_music: string | null;
  video_sound: string | null;
  video_dialogue: string | null;
  video_action: string | null;
  primary_emotion: string | null;
  emotional_tone: string | null;
  conveys: string | null;
  user_intent: string | null;
  rhetorical_role: string | null;
  text_media_relationship: string | null;
  metaphor: string | null;
  humor_mechanism: string | null;
  cultural_reference: string | null;
  reference_entity: string | null;
  reference_source: string | null;
  reference_plot_context: string | null;
  analogy_target: string | null;
  analogy_scope: string | null;
  meme_format: string | null;
  persuasion_strategy: string | null;
  brand_signals: string[];
  trend_signal: string | null;
  reuse_pattern: string | null;
  why_it_works: string | null;
  audience_takeaway: string | null;
  search_keywords: string[];
  confidence_notes: string | null;
  usage_notes: string | null;
}

export interface MediaAssetRecord {
  assetId: string;
  canonicalMediaUrl: string | null;
  canonicalFilePath: string | null;
  promotedVideoSourceUrl: string | null;
  promotedVideoFilePath: string | null;
  mediaKind: MediaKind | InterceptedMediaClass;
  fingerprint: MediaFingerprint | null;
  similarityEmbedding: MediaSimilarityEmbedding | null;
  starred: boolean;
  usageIds: string[];
  sourceUrls: string[];
  previewUrls: string[];
  posterUrls: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MediaAssetSummary {
  assetId: string;
  status: "fallback_first_analysis" | "aggregated";
  sourceUsageId: string | null;
  usageCount: number;
  completeAnalysisCount: number;
  summary: UsageAnalysis | null;
  createdAt: string;
  updatedAt: string;
}

export type MediaAssetSyncStatus = "not_applicable" | "indexed" | "stale" | "missing";

export interface TweetUsageRecord {
  usageId: string;
  tweet: ExtractedTweet;
  mediaIndex: number;
  analysis: UsageAnalysis;
  mediaAssetId: string | null;
  mediaLocalFilePath: string | null;
  mediaPlayableFilePath: string | null;
  mediaAssetStarred: boolean;
  mediaAssetUsageCount: number;
  phashMatchCount: number;
  duplicateGroupId: string | null;
  duplicateGroupUsageCount: number;
  mediaAssetSyncStatus?: MediaAssetSyncStatus;
  hotnessScore: number;
}

export interface CapturedTweetRecord {
  tweetKey: string;
  tweet: ExtractedTweet;
  isPriorityAccount?: boolean;
  hasMedia: boolean;
  mediaCount: number;
  analyzedMediaCount: number;
  indexedMediaCount?: number;
  staleMediaCount?: number;
  missingMediaCount?: number;
  mediaAssetSyncStatus?: MediaAssetSyncStatus;
  firstMediaAssetId: string | null;
  firstMediaAssetStarred: boolean;
  topicLabels: string[];
  topTopicLabel: string | null;
  topTopicHotnessScore: number;
  relativeEngagementScore: number | null;
  relativeEngagementBand: RelativeEngagementBand | null;
}

export type CapturedTweetFilter = "with_media" | "without_media" | "all";
export type CapturedTweetSort = "newest_desc" | "newest_asc";

export interface CapturedTweetPage {
  tweets: CapturedTweetRecord[];
  page: number;
  pageSize: number;
  totalResults: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  query: string;
  tweetFilter: CapturedTweetFilter;
  sort: CapturedTweetSort;
  counts: Record<CapturedTweetFilter, number>;
}

export type UsageMatchFilter = "all" | "matched" | "phash" | "starred" | "starred_or_duplicates";
export type UsageSort =
  | "newest_desc"
  | "newest_asc"
  | "duplicates_desc"
  | "duplicates_asc"
  | "hotness_desc"
  | "hotness_asc";

export interface UsagePage {
  usages: TweetUsageRecord[];
  page: number;
  pageSize: number;
  totalResults: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  query: string;
  matchFilter: UsageMatchFilter;
  repeatMinimum: number;
  sort: UsageSort;
  hideDuplicateAssets: boolean;
  counts: Record<UsageMatchFilter, number>;
}

export type TopicSignalKind = "entity" | "cashtag" | "hashtag" | "phrase" | "reference" | "brand" | "intent";
export type TopicSentiment = "positive" | "negative" | "mixed" | "neutral";
export type TopicStance =
  | "supportive"
  | "critical"
  | "observational"
  | "celebratory"
  | "anxious"
  | "curious"
  | "mixed";
export type TopicOpinionIntensity = "low" | "medium" | "high";

export interface TweetTopicSignal {
  key: string;
  label: string;
  kind: TopicSignalKind;
  source: "tweet_text" | "usage_analysis" | "llm_topic";
  confidence: number;
}

export interface TweetTopicAnalysisRecord {
  analysisId: string;
  tweetKey: string;
  tweetId: string | null;
  authorUsername: string | null;
  createdAt: string | null;
  text: string | null;
  usageIds: string[];
  summaryLabel: string | null;
  isNews: boolean;
  newsPeg: string | null;
  whyNow: string | null;
  sentiment: TopicSentiment;
  stance: TopicStance;
  emotionalTone: string | null;
  opinionIntensity: TopicOpinionIntensity;
  targetEntity: string | null;
  confidence: number;
  signals: TweetTopicSignal[];
  analyzedAt: string;
  model: string;
}

export interface TweetTopicRecord {
  tweetKey: string;
  tweetId: string | null;
  authorUsername: string | null;
  createdAt: string | null;
  text: string | null;
  usageIds: string[];
  signals: TweetTopicSignal[];
  topicIds: string[];
  topTopicId: string | null;
  topTopicLabel: string | null;
  topTopicHotnessScore: number;
}

export interface TopicClusterRecord {
  topicId: string;
  label: string;
  normalizedLabel: string;
  kind: TopicSignalKind;
  signalCount: number;
  tweetCount: number;
  mediaUsageCount: number;
  textOnlyTweetCount: number;
  uniqueAuthorCount: number;
  totalLikes: number;
  priorityTweetCount?: number;
  priorityAuthorCount?: number;
  recentTweetCount24h: number;
  mostRecentAt: string | null;
  oldestAt: string | null;
  hotnessScore: number;
  isStale: boolean;
  sources: Array<"tweet_text" | "usage_analysis" | "llm_topic">;
  representativeTweetKeys: string[];
  representativeTweets: Array<{
    tweetKey: string;
    tweetId: string | null;
    authorUsername: string | null;
    text: string | null;
    createdAt: string | null;
  }>;
  suggestedAngles: string[];
}

export interface GroundedNewsSource {
  uri: string;
  title: string;
}

export interface GroundedTopicNews {
  topicId: string;
  fetchedAt: string;
  model: string;
  summary: string;
  summaryWithCitations: string;
  whyNow: string;
  suggestedAngles: string[];
  searchQueries: string[];
  sources: GroundedNewsSource[];
}

export interface GroundedTopicNewsCache {
  generatedAt: string;
  items: GroundedTopicNews[];
}

export interface TopicIndex {
  generatedAt: string;
  tweetCount: number;
  topicCount: number;
  topicAnalyses: TweetTopicAnalysisRecord[];
  tweets: TweetTopicRecord[];
  topics: TopicClusterRecord[];
}

export type TopicClusterSort =
  | "hotness_desc"
  | "hotness_asc"
  | "newest_desc"
  | "newest_asc"
  | "tweets_desc"
  | "tweets_asc"
  | "likes_desc"
  | "likes_asc"
  | "recent_24h_desc"
  | "recent_24h_asc";
export type TopicClusterFreshnessFilter = "all" | "fresh" | "active_24h" | "active_72h" | "stale";
export type TopicClusterKindFilter = TopicSignalKind | "all";

export interface TopicClusterPage {
  topics: TopicClusterRecord[];
  page: number;
  pageSize: number;
  totalResults: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  query: string;
  sort: TopicClusterSort;
  freshness: TopicClusterFreshnessFilter;
  kind: TopicClusterKindFilter;
  counts: Record<TopicClusterFreshnessFilter, number>;
}

export interface MediaAssetPhashMatch {
  asset: MediaAssetRecord;
  distance: number | null;
  similarityScore: number;
  usages: TweetUsageRecord[];
}

export interface MediaAssetView {
  asset: MediaAssetRecord;
  summary: MediaAssetSummary | null;
  duplicateUsages: TweetUsageRecord[];
  phashMatches: MediaAssetPhashMatch[];
  nearestNeighbors: MediaAssetPhashMatch[];
}

export type RunTask =
  | "crawl_timeline"
  | "crawl_x_api"
  | "capture_priority_accounts"
  | "capture_x_api_timeline"
  | "capture_x_api_tweet"
  | "capture_x_api_tweet_and_compose_replies"
  | "analyze_missing"
  | "analyze_topics"
  | "rebuild_media_assets"
  | "backfill_media_native_types";
export type RunTrigger = "manual" | "scheduled" | "follow_up";
export type RunStatus = "queued" | "running" | "completed" | "failed";

export interface SchedulerConfig {
  enabled: boolean;
  frequency: "daily";
  hour: number;
  minute: number;
  times: string[];
  timezone: string;
  updatedAt: string;
  lastEvaluatedAt: string | null;
  lastTriggeredAt: string | null;
  lastProcessedSlotAt: string | null;
  lastSkippedAt: string | null;
  lastSkipReason: string | null;
}

export interface PriorityAccountEntry {
  key: string;
  username: string;
  label: string | null;
  userId: string | null;
  lastSeenTweetId: string | null;
  lastCheckedAt: string | null;
  lastCapturedAt: string | null;
  lastCaptureCount: number;
  lastError: string | null;
}

export interface PriorityAccountsConfig {
  enabled: boolean;
  updatedAt: string;
  lastScheduledRunAt: string | null;
  accounts: PriorityAccountEntry[];
}

export interface RunHistoryEntry {
  runControlId: string;
  task: RunTask;
  trigger: RunTrigger;
  status: RunStatus;
  startedAt: string;
  completedAt: string | null;
  exitCode: number | null;
  errorMessage: string | null;
  logPath: string;
  manifestRunId: string | null;
}
