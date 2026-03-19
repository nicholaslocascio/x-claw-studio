import fs from "node:fs";
import path from "node:path";
import { slugify, writeJson } from "@/src/lib/fs";
import type {
  ExtractedTweet,
  TopicClusterRecord,
  TopicIndex,
  TopicSignalKind,
  TweetTopicAnalysisRecord,
  TweetTopicRecord,
  TweetTopicSignal,
  TweetUsageRecord
} from "@/src/lib/types";

const projectRoot = process.cwd();
const topicIndexPath = path.join(projectRoot, "data", "analysis", "topics", "index.json");
const TOPIC_HALF_LIFE_HOURS = 30;
const TOPIC_STALE_AFTER_HOURS = 72;
const GENERIC_LABELS = new Set([
  "the",
  "this",
  "that",
  "you",
  "your",
  "how",
  "what",
  "when",
  "where",
  "who",
  "why",
  "just",
  "they",
  "there",
  "really",
  "going",
  "about",
  "have",
  "null",
  "none",
  "n/a",
  "na",
  "someone",
  "people",
  "one",
  "another",
  "but",
  "and",
  "will",
  "his",
  "her",
  "their"
]);

function buildTweetKey(tweet: ExtractedTweet): string {
  return tweet.tweetId ?? `${tweet.sourceName}:${tweet.authorUsername ?? "unknown"}:${tweet.text ?? ""}`;
}

function parseCompactNumber(value: string | null | undefined): number {
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

function getTimestampMs(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLabel(label: string): string {
  return label
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[“”"']/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

function normalizeAuthorUsername(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/^@+/, "").toLowerCase() ?? "";
  return normalized || null;
}

function titleCaseCompact(label: string): string {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      if (/^[$#@]/.test(part) || /^[A-Z0-9]{2,}$/.test(part)) {
        return part;
      }

      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

function isHighQualityLabel(label: string, kind: TopicSignalKind): boolean {
  const normalized = normalizeLabel(label);
  if (normalized.length < 2) {
    return false;
  }

  if (GENERIC_LABELS.has(normalized)) {
    return false;
  }

  if (normalized === "unknown") {
    return false;
  }

  if (/^\$?\d+$/.test(normalized)) {
    return false;
  }

  if (normalized.length > 60) {
    return false;
  }

  if (/[!?]/.test(normalized)) {
    return false;
  }

  if (kind === "phrase" && normalized.split(" ").length > 5) {
    return false;
  }

  return true;
}

function filterSignals(signals: TweetTopicSignal[]): TweetTopicSignal[] {
  const bestByKey = new Map<string, TweetTopicSignal>();

  for (const signal of signals) {
    if (!isHighQualityLabel(signal.label, signal.kind)) {
      continue;
    }

    const normalized = normalizeLabel(signal.label);
    const key = `${signal.kind}:${normalized}`;
    const nextSignal: TweetTopicSignal = {
      ...signal,
      key,
      label: titleCaseCompact(signal.label)
    };
    const existing = bestByKey.get(key);
    if (!existing || nextSignal.confidence > existing.confidence) {
      bestByKey.set(key, nextSignal);
    }
  }

  return Array.from(bestByKey.values())
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 3);
}

function buildFallbackSignals(tweet: ExtractedTweet): TweetTopicSignal[] {
  const text = tweet.text ?? "";
  const cashtags = text.match(/\$[a-z][a-z0-9_]{1,}/gi) ?? [];
  const hashtags = text.match(/#[a-z][a-z0-9_]{1,}/gi) ?? [];
  const values = [...cashtags, ...hashtags].slice(0, 3);

  return values.map((value) => ({
    key: `${value.startsWith("$") ? "cashtag" : "hashtag"}:${value.toLowerCase()}`,
    label: value.toUpperCase(),
    kind: value.startsWith("$") ? "cashtag" : "hashtag",
    source: "tweet_text",
    confidence: 0.75
  }));
}

function buildPrimaryTopicSignal(analysis: TweetTopicAnalysisRecord | null, signals: TweetTopicSignal[]): TweetTopicSignal | null {
  const summaryLabel = analysis?.summaryLabel?.trim();
  if (summaryLabel && isHighQualityLabel(summaryLabel, "phrase")) {
    const normalized = normalizeLabel(summaryLabel);
    const matchingSignal = signals.find((signal) => normalizeLabel(signal.label) === normalized);

    return {
      key: `phrase:${normalized}`,
      label: titleCaseCompact(summaryLabel),
      kind: matchingSignal?.kind ?? "phrase",
      source: "llm_topic",
      confidence: Math.max(analysis?.confidence ?? 0.8, matchingSignal?.confidence ?? 0.8)
    };
  }

  return signals[0] ?? null;
}

export function emptyTopicIndex(tweetCount = 0): TopicIndex {
  return {
    generatedAt: new Date(0).toISOString(),
    tweetCount,
    topicCount: 0,
    topicAnalyses: [],
    tweets: [],
    topics: []
  };
}

export function computeTopicHotnessScore(input: {
  tweetCount: number;
  uniqueAuthorCount: number;
  totalLikes: number;
  priorityTweetCount?: number;
  recentTweetCount24h: number;
  mostRecentTimestampMs: number;
  nowMs?: number;
}): number {
  const nowMs = input.nowMs ?? Date.now();
  const ageHours = Math.max(0, (nowMs - input.mostRecentTimestampMs) / (1000 * 60 * 60));
  const decay = Math.exp((-Math.log(2) * ageHours) / TOPIC_HALF_LIFE_HOURS);
  const recentShare = Math.min(1, input.recentTweetCount24h / Math.max(1, input.tweetCount));
  const engagement =
    1 +
    1.8 * Math.log1p(Math.max(1, input.tweetCount)) +
    1.2 * Math.log1p(Math.max(1, input.uniqueAuthorCount)) +
    1.1 * Math.log1p(Math.max(0, input.totalLikes)) +
    1.2 * recentShare;
  const priorityBoost = 1 + Math.min(0.75, Math.max(0, input.priorityTweetCount ?? 0) * 0.2);
  const score = engagement * decay * priorityBoost;
  return Number.isFinite(score) ? Number(score.toFixed(4)) : 0;
}

function buildAngles(input: {
  label: string;
  kind: TopicSignalKind;
  sources: Set<TweetTopicSignal["source"]>;
  recentTweetCount24h: number;
  representativeTweets: Array<{ text: string | null }>;
  whyNow: string[];
}): string[] {
  const angles = new Set<string>();
  const lowerText = input.representativeTweets.map((tweet) => tweet.text?.toLowerCase() ?? "").join(" ");

  if (input.recentTweetCount24h >= 2) {
    angles.add(`Post a fast take on ${input.label} while it is still moving.`);
  }

  if (input.whyNow[0]) {
    angles.add(input.whyNow[0]);
  }

  if (/\bvs\b|\bversus\b|\bcompete\b|\brace\b|\bcopy\b|\bsteal\b/.test(lowerText)) {
    angles.add(`Frame ${input.label} as a rivalry and pick the side that the crowd is underrating.`);
  }

  if (input.kind === "cashtag") {
    angles.add(`Turn ${input.label} into a market read instead of a headline recap.`);
  }

  if (angles.size < 3) {
    angles.add(`Summarize the strongest shift showing up around ${input.label}.`);
    angles.add(`Write the second-order take on ${input.label}, not the obvious one.`);
  }

  return Array.from(angles).slice(0, 3);
}

export function buildTopicIndex(input: {
  tweets: ExtractedTweet[];
  usages: TweetUsageRecord[];
  topicAnalyses: TweetTopicAnalysisRecord[];
  nowMs?: number;
  priorityAuthorUsernames?: Set<string>;
}): TopicIndex {
  const analysisByTweetKey = new Map(input.topicAnalyses.map((analysis) => [analysis.tweetKey, analysis]));
  const usageByTweetKey = new Map<string, TweetUsageRecord[]>();
  for (const usage of input.usages) {
    const tweetKey = buildTweetKey(usage.tweet);
    const existing = usageByTweetKey.get(tweetKey);
    if (existing) {
      existing.push(usage);
    } else {
      usageByTweetKey.set(tweetKey, [usage]);
    }
  }

  const topicBuckets = new Map<
    string,
    {
      topicId: string;
      label: string;
      normalizedLabel: string;
      kind: TopicSignalKind;
      tweetKeys: Set<string>;
      usageIds: Set<string>;
      authors: Set<string>;
      totalLikes: number;
      priorityTweetCount: number;
      priorityAuthors: Set<string>;
      recentTweetCount24h: number;
      timestamps: number[];
      textOnlyTweetCount: number;
      sources: Set<TweetTopicSignal["source"]>;
      whyNow: string[];
      representativeTweets: Array<{
        tweetKey: string;
        tweetId: string | null;
        authorUsername: string | null;
        text: string | null;
        createdAt: string | null;
      }>;
    }
  >();
  const nowMs = input.nowMs ?? Date.now();

  const tweets: TweetTopicRecord[] = input.tweets.map((tweet) => {
    const tweetKey = buildTweetKey(tweet);
    const usages = usageByTweetKey.get(tweetKey) ?? [];
    const analysis = analysisByTweetKey.get(tweetKey) ?? null;
    const signals = filterSignals(analysis?.signals ?? buildFallbackSignals(tweet));
    const primaryTopic = buildPrimaryTopicSignal(analysis, signals);
    const topicIds: string[] = [];
    const timestampMs = getTimestampMs(tweet.createdAt ?? tweet.extraction.extractedAt);
    const isRecent = timestampMs > 0 && nowMs - timestampMs <= 24 * 60 * 60 * 1000;
    const likes = parseCompactNumber(tweet.metrics.likes);

    for (const signal of primaryTopic ? [primaryTopic] : []) {
      const normalizedLabel = normalizeLabel(signal.label);
      const topicId = `${signal.kind}:${slugify(normalizedLabel) || "topic"}`;
      topicIds.push(topicId);
      let bucket = topicBuckets.get(topicId);
      if (!bucket) {
        bucket = {
          topicId,
          label: signal.label,
          normalizedLabel,
          kind: signal.kind,
          tweetKeys: new Set<string>(),
          usageIds: new Set<string>(),
          authors: new Set<string>(),
          totalLikes: 0,
          priorityTweetCount: 0,
          priorityAuthors: new Set<string>(),
          recentTweetCount24h: 0,
          timestamps: [],
          textOnlyTweetCount: 0,
          sources: new Set<TweetTopicSignal["source"]>(),
          whyNow: [],
          representativeTweets: []
        };
        topicBuckets.set(topicId, bucket);
      }

      bucket.tweetKeys.add(tweetKey);
      for (const usage of usages) {
        bucket.usageIds.add(usage.usageId);
      }
      if (tweet.authorUsername) {
        bucket.authors.add(tweet.authorUsername);
      }
      bucket.totalLikes += likes;
      const normalizedAuthorUsername = normalizeAuthorUsername(tweet.authorUsername);
      if (normalizedAuthorUsername && input.priorityAuthorUsernames?.has(normalizedAuthorUsername)) {
        bucket.priorityTweetCount += 1;
        bucket.priorityAuthors.add(normalizedAuthorUsername);
      }
      if (isRecent) {
        bucket.recentTweetCount24h += 1;
      }
      if (timestampMs > 0) {
        bucket.timestamps.push(timestampMs);
      }
      if (usages.length === 0) {
        bucket.textOnlyTweetCount += 1;
      }
      bucket.sources.add(signal.source);
      if (analysis?.whyNow) {
        bucket.whyNow.push(analysis.whyNow);
      }
      bucket.representativeTweets.push({
        tweetKey,
        tweetId: tweet.tweetId,
        authorUsername: tweet.authorUsername,
        text: tweet.text,
        createdAt: tweet.createdAt
      });
    }

    return {
      tweetKey,
      tweetId: tweet.tweetId,
      authorUsername: tweet.authorUsername,
      createdAt: tweet.createdAt,
      text: tweet.text,
      usageIds: usages.map((usage) => usage.usageId),
      signals,
      topicIds,
      topTopicId: null,
      topTopicLabel: primaryTopic?.label ?? analysis?.summaryLabel ?? null,
      topTopicHotnessScore: 0
    };
  });

  const topics: TopicClusterRecord[] = Array.from(topicBuckets.values())
    .map((bucket) => {
      const mostRecentTimestampMs = bucket.timestamps.reduce((latest, value) => Math.max(latest, value), 0);
      const oldestTimestampMs = bucket.timestamps.reduce((oldest, value) => (oldest === 0 ? value : Math.min(oldest, value)), 0);
      const hotnessScore = computeTopicHotnessScore({
        tweetCount: bucket.tweetKeys.size,
        uniqueAuthorCount: bucket.authors.size,
        totalLikes: bucket.totalLikes,
        priorityTweetCount: bucket.priorityTweetCount,
        recentTweetCount24h: bucket.recentTweetCount24h,
        mostRecentTimestampMs,
        nowMs
      });
      const representativeTweets = bucket.representativeTweets
        .sort((left, right) => getTimestampMs(right.createdAt) - getTimestampMs(left.createdAt))
        .slice(0, 3);

      return {
        topicId: bucket.topicId,
        label: bucket.label,
        normalizedLabel: bucket.normalizedLabel,
        kind: bucket.kind,
        signalCount: bucket.tweetKeys.size,
        tweetCount: bucket.tweetKeys.size,
        mediaUsageCount: bucket.usageIds.size,
        textOnlyTweetCount: bucket.textOnlyTweetCount,
        uniqueAuthorCount: bucket.authors.size,
        totalLikes: bucket.totalLikes,
        priorityTweetCount: bucket.priorityTweetCount,
        priorityAuthorCount: bucket.priorityAuthors.size,
        recentTweetCount24h: bucket.recentTweetCount24h,
        mostRecentAt: mostRecentTimestampMs > 0 ? new Date(mostRecentTimestampMs).toISOString() : null,
        oldestAt: oldestTimestampMs > 0 ? new Date(oldestTimestampMs).toISOString() : null,
        hotnessScore,
        isStale:
          mostRecentTimestampMs === 0 ||
          (nowMs - mostRecentTimestampMs) / (1000 * 60 * 60) >= TOPIC_STALE_AFTER_HOURS,
        sources: Array.from(bucket.sources).sort(),
        representativeTweetKeys: representativeTweets.map((tweet) => tweet.tweetKey),
        representativeTweets,
        suggestedAngles: buildAngles({
          label: bucket.label,
          kind: bucket.kind,
          sources: bucket.sources,
          recentTweetCount24h: bucket.recentTweetCount24h,
          representativeTweets,
          whyNow: bucket.whyNow
        })
      };
    })
    .sort((left, right) => right.hotnessScore - left.hotnessScore || right.tweetCount - left.tweetCount || left.label.localeCompare(right.label));

  const topicById = new Map(topics.map((topic) => [topic.topicId, topic]));
  const enrichedTweets = tweets.map((tweet) => {
    const rankedTopics = tweet.topicIds
      .map((topicId) => topicById.get(topicId))
      .filter((value): value is TopicClusterRecord => Boolean(value))
      .sort((left, right) => right.hotnessScore - left.hotnessScore);
    const topTopic = rankedTopics[0] ?? null;

    return {
      ...tweet,
      topicIds: rankedTopics.map((topic) => topic.topicId),
      topTopicId: topTopic?.topicId ?? null,
      topTopicLabel: topTopic?.label ?? tweet.topTopicLabel,
      topTopicHotnessScore: topTopic?.hotnessScore ?? 0
    };
  });

  return {
    generatedAt: new Date(nowMs).toISOString(),
    tweetCount: input.tweets.length,
    topicCount: topics.length,
    topicAnalyses: input.topicAnalyses,
    tweets: enrichedTweets,
    topics
  };
}

export function writeTopicIndex(index: TopicIndex): string {
  writeJson(topicIndexPath, index);
  return topicIndexPath;
}

export function readTopicIndex(): TopicIndex | null {
  if (!fs.existsSync(topicIndexPath)) {
    return null;
  }

  const parsed = JSON.parse(fs.readFileSync(topicIndexPath, "utf8")) as Partial<TopicIndex>;
  if (!Array.isArray(parsed.topicAnalyses) || !Array.isArray(parsed.tweets) || !Array.isArray(parsed.topics)) {
    return null;
  }

  return parsed as TopicIndex;
}
