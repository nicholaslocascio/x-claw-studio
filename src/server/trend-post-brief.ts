import type { CapturedTweetRecord, GroundedTopicNews, TopicClusterRecord } from "@/src/lib/types";
import { getCapturedTweetData, getTopicPageData, parseCompactNumber } from "@/src/server/data";
import { getGroundedTopicNews } from "@/src/server/topic-grounded-news";

const DEFAULT_WINDOW_HOURS = 48;
const DEFAULT_MAX_TOPICS = 6;
const DEFAULT_MAX_TWEETS = 8;

export interface TrendDigestBriefResult {
  briefText: string;
  generatedAt: string;
  timeframeHours: number;
  topicCount: number;
  tweetCount: number;
  topics: Array<{
    label: string;
    kind: string;
    hotnessScore: number;
    recentTweetCount24h: number;
    tweetCount: number;
    mostRecentAt: string | null;
    whyNow: string;
  }>;
  tweets: Array<{
    authorUsername: string | null;
    text: string;
    likes: number;
    relativeEngagementScore: number | null;
    relativeEngagementBand: CapturedTweetRecord["relativeEngagementBand"];
    topicLabel: string | null;
    createdAt: string | null;
  }>;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function getTimestampMs(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function getTweetTimestamp(record: CapturedTweetRecord): string | null {
  return record.tweet.createdAt ?? record.tweet.extraction.extractedAt ?? null;
}

function getTweetTimestampMs(record: CapturedTweetRecord): number {
  return getTimestampMs(getTweetTimestamp(record));
}

function formatCompactUtc(value: string | null | undefined): string {
  if (!value) {
    return "unknown time";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "unknown time";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
    timeZoneName: "short"
  }).format(parsed);
}

function truncateText(value: string | null | undefined, maximumLength: number): string {
  const normalized = value?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) {
    return "";
  }

  if (normalized.length <= maximumLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maximumLength - 1)).trimEnd()}…`;
}

function buildTopicRecencyFilter(windowStartMs: number) {
  return (topic: TopicClusterRecord) => {
    const mostRecentMs = getTimestampMs(topic.mostRecentAt);
    return mostRecentMs > 0 && mostRecentMs >= windowStartMs;
  };
}

function selectTopics(input: {
  topics: TopicClusterRecord[];
  groundedNewsByTopicId: Map<string, GroundedTopicNews>;
  maxTopics: number;
  windowStartMs: number;
}): Array<TopicClusterRecord & { groundedNews: GroundedTopicNews | null }> {
  const withGroundedNews = input.topics.map((topic) => ({
    ...topic,
    groundedNews: input.groundedNewsByTopicId.get(topic.topicId) ?? null
  }));
  const recentTopics = withGroundedNews.filter(buildTopicRecencyFilter(input.windowStartMs));
  const pool = recentTopics.length > 0 ? recentTopics : withGroundedNews;

  return pool
    .slice()
    .sort((left, right) => {
      return (
        Number(Boolean(right.priorityTweetCount ?? 0)) - Number(Boolean(left.priorityTweetCount ?? 0)) ||
        right.hotnessScore - left.hotnessScore ||
        right.recentTweetCount24h - left.recentTweetCount24h ||
        getTimestampMs(right.mostRecentAt) - getTimestampMs(left.mostRecentAt) ||
        right.totalLikes - left.totalLikes ||
        left.label.localeCompare(right.label)
      );
    })
    .slice(0, input.maxTopics);
}

function selectTweets(input: {
  tweets: CapturedTweetRecord[];
  maxTweets: number;
  windowStartMs: number;
}): CapturedTweetRecord[] {
  const recentTweets = input.tweets.filter((tweet) => {
    if (!tweet.tweet.text?.trim()) {
      return false;
    }

    return getTweetTimestampMs(tweet) >= input.windowStartMs;
  });
  const pool = recentTweets.length > 0 ? recentTweets : input.tweets.filter((tweet) => tweet.tweet.text?.trim());
  const topicCounts = new Map<string, number>();
  const authorCounts = new Map<string, number>();

  return pool
    .slice()
    .sort((left, right) => {
      const leftLikes = parseCompactNumber(left.tweet.metrics.likes);
      const rightLikes = parseCompactNumber(right.tweet.metrics.likes);
      return (
        Number(Boolean(right.isPriorityAccount)) - Number(Boolean(left.isPriorityAccount)) ||
        (right.relativeEngagementScore ?? -1) - (left.relativeEngagementScore ?? -1) ||
        rightLikes - leftLikes ||
        right.topTopicHotnessScore - left.topTopicHotnessScore ||
        getTweetTimestampMs(right) - getTweetTimestampMs(left) ||
        left.tweetKey.localeCompare(right.tweetKey)
      );
    })
    .filter((tweet) => {
      const topicKey = tweet.topTopicLabel ?? "";
      const authorKey = tweet.tweet.authorUsername ?? "";
      const topicCount = topicKey ? topicCounts.get(topicKey) ?? 0 : 0;
      const authorCount = authorKey ? authorCounts.get(authorKey) ?? 0 : 0;
      const keep = topicCount < 2 && authorCount < 2;

      if (keep) {
        if (topicKey) {
          topicCounts.set(topicKey, topicCount + 1);
        }

        if (authorKey) {
          authorCounts.set(authorKey, authorCount + 1);
        }
      }

      return keep;
    })
    .slice(0, input.maxTweets);
}

export function buildTrendDigestBriefFromData(input: {
  topics: TopicClusterRecord[];
  tweets: CapturedTweetRecord[];
  groundedNewsByTopicId?: Map<string, GroundedTopicNews>;
  timeframeHours?: number;
  maxTopics?: number;
  maxTweets?: number;
  now?: Date;
}): TrendDigestBriefResult {
  const timeframeHours = clampInteger(input.timeframeHours ?? DEFAULT_WINDOW_HOURS, 6, 168);
  const maxTopics = clampInteger(input.maxTopics ?? DEFAULT_MAX_TOPICS, 3, 12);
  const maxTweets = clampInteger(input.maxTweets ?? DEFAULT_MAX_TWEETS, 4, 16);
  const now = input.now ?? new Date();
  const nowMs = now.getTime();
  const windowStartMs = nowMs - timeframeHours * 60 * 60 * 1000;
  const groundedNewsByTopicId = input.groundedNewsByTopicId ?? new Map<string, GroundedTopicNews>();
  const topics = selectTopics({
    topics: input.topics,
    groundedNewsByTopicId,
    maxTopics,
    windowStartMs
  });
  const tweets = selectTweets({
    tweets: input.tweets,
    maxTweets,
    windowStartMs
  });

  const lines = [
    `Build one original X post from the strongest signals in the last ${timeframeHours} hours of our captured Twitter/X data.`,
    "We are going for a live 'do you understand what happened' post, not a neutral recap.",
    "Use the items below as raw material for one sharp post that stacks multiple developments into a single escalating read.",
    "Favor conflict, incentive flips, platform changes, money moves, product behavior shifts, labor impact, regulation, and benchmark surprises.",
    "You can use a short opener plus stacked `>` lines if that lands best.",
    "Keep it factual to the supplied notes. Do not invent specifics that are not present here.",
    "If several bullets tell the same story, compress them into one cleaner line instead of repeating the theme.",
    "End with a kicker, warning, or verdict. Do not end like a summary thread.",
    "",
    "Topic signals:",
    ...topics.map((topic, index) => {
      const parts = [
        `${index + 1}. ${topic.label}`,
        `kind=${topic.kind}`,
        `hotness=${topic.hotnessScore.toFixed(2)}`,
        `recent_24h=${topic.recentTweetCount24h}`,
        `tweets=${topic.tweetCount}`,
        `latest=${formatCompactUtc(topic.mostRecentAt)}`
      ];
      const angle = topic.groundedNews?.whyNow || topic.groundedNews?.summary || topic.suggestedAngles[0] || "no extra angle";
      return `- ${parts.join(" | ")} | why_now=${truncateText(angle, 180)}`;
    }),
    "",
    "High-signal tweets:",
    ...tweets.map((tweet, index) => {
      const likes = parseCompactNumber(tweet.tweet.metrics.likes);
      const author = tweet.tweet.authorUsername ? `@${tweet.tweet.authorUsername}` : "@unknown";
      const topicLabel = tweet.topTopicLabel ?? "no_topic";
      const relative = tweet.relativeEngagementScore === null ? "n/a" : tweet.relativeEngagementScore.toFixed(2);
      const band = tweet.relativeEngagementBand ?? "unknown";
      return `- ${index + 1}. ${author} | rel=${relative} | band=${band} | likes=${likes} | topic=${topicLabel} | time=${formatCompactUtc(getTweetTimestamp(tweet))} | text=${truncateText(tweet.tweet.text, 220)}`;
    }),
    "",
    "Writing target:",
    "- one post, not a thread",
    "- postable voice, not analyst voice",
    "- specific nouns and companies",
    "- no filler, no grandstanding, no generic 'everything changed' language unless the bullets earn it"
  ];

  return {
    briefText: lines.join("\n"),
    generatedAt: now.toISOString(),
    timeframeHours,
    topicCount: topics.length,
    tweetCount: tweets.length,
    topics: topics.map((topic) => ({
      label: topic.label,
      kind: topic.kind,
      hotnessScore: topic.hotnessScore,
      recentTweetCount24h: topic.recentTweetCount24h,
      tweetCount: topic.tweetCount,
      mostRecentAt: topic.mostRecentAt,
      whyNow: truncateText(topic.groundedNews?.whyNow || topic.groundedNews?.summary || topic.suggestedAngles[0] || "", 220)
    })),
    tweets: tweets.map((tweet) => ({
      authorUsername: tweet.tweet.authorUsername ?? null,
      text: truncateText(tweet.tweet.text, 280),
      likes: parseCompactNumber(tweet.tweet.metrics.likes),
      relativeEngagementScore: tweet.relativeEngagementScore,
      relativeEngagementBand: tweet.relativeEngagementBand,
      topicLabel: tweet.topTopicLabel ?? null,
      createdAt: getTweetTimestamp(tweet)
    }))
  };
}

export async function buildTrendDigestBrief(input?: {
  timeframeHours?: number;
  maxTopics?: number;
  maxTweets?: number;
}): Promise<TrendDigestBriefResult> {
  const topicData = getTopicPageData();
  const tweetData = getCapturedTweetData();
  const selectedTopics = selectTopics({
    topics: topicData.topicClusters,
    groundedNewsByTopicId: new Map<string, GroundedTopicNews>(),
    maxTopics: clampInteger(input?.maxTopics ?? DEFAULT_MAX_TOPICS, 3, 12),
    windowStartMs: Date.now() - clampInteger(input?.timeframeHours ?? DEFAULT_WINDOW_HOURS, 6, 168) * 60 * 60 * 1000
  });
  const groundedNewsByTopicId = await getGroundedTopicNews(selectedTopics, { refreshIfStale: false });

  return buildTrendDigestBriefFromData({
    topics: topicData.topicClusters,
    tweets: tweetData.capturedTweets,
    groundedNewsByTopicId,
    timeframeHours: input?.timeframeHours,
    maxTopics: input?.maxTopics,
    maxTweets: input?.maxTweets
  });
}
