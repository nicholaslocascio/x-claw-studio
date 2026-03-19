import { describe, expect, it } from "vitest";
import type { CapturedTweetRecord, TopicClusterRecord } from "@/src/lib/types";
import { buildTrendDigestBriefFromData } from "@/src/server/trend-post-brief";

function createTopic(overrides: Partial<TopicClusterRecord>): TopicClusterRecord {
  return {
    topicId: overrides.topicId ?? "topic-1",
    label: overrides.label ?? "OpenAI",
    normalizedLabel: overrides.normalizedLabel ?? "openai",
    kind: overrides.kind ?? "entity",
    signalCount: overrides.signalCount ?? 3,
    tweetCount: overrides.tweetCount ?? 5,
    mediaUsageCount: overrides.mediaUsageCount ?? 2,
    textOnlyTweetCount: overrides.textOnlyTweetCount ?? 3,
    uniqueAuthorCount: overrides.uniqueAuthorCount ?? 4,
    totalLikes: overrides.totalLikes ?? 24000,
    recentTweetCount24h: overrides.recentTweetCount24h ?? 4,
    mostRecentAt: overrides.mostRecentAt ?? "2026-03-18T16:00:00.000Z",
    oldestAt: overrides.oldestAt ?? "2026-03-17T10:00:00.000Z",
    hotnessScore: overrides.hotnessScore ?? 9.8,
    isStale: overrides.isStale ?? false,
    sources: overrides.sources ?? ["tweet_text"],
    representativeTweetKeys: overrides.representativeTweetKeys ?? ["tweet-1"],
    representativeTweets: overrides.representativeTweets ?? [
      {
        tweetKey: "tweet-1",
        tweetId: "tweet-1",
        authorUsername: "alice",
        text: "OpenAI moved again",
        createdAt: "2026-03-18T15:30:00.000Z"
      }
    ],
    suggestedAngles: overrides.suggestedAngles ?? ["platform power shift"]
  };
}

function createTweet(overrides: Partial<CapturedTweetRecord>): CapturedTweetRecord {
  return {
    tweetKey: overrides.tweetKey ?? "tweet-1",
    tweet: overrides.tweet ?? {
      sourceName: "x",
      tweetId: "tweet-1",
      tweetUrl: "https://x.com/alice/status/1",
      authorHandle: "@alice",
      authorUsername: "alice",
      authorDisplayName: "Alice",
      authorProfileImageUrl: null,
      authorFollowerCount: 10000,
      createdAt: "2026-03-18T15:00:00.000Z",
      text: "OpenAI just changed the cloud stack again",
      metrics: {
        replies: "120",
        reposts: "800",
        likes: "45K",
        bookmarks: null,
        views: null
      },
      media: [],
      extraction: {
        articleIndex: 0,
        extractedAt: "2026-03-18T15:05:00.000Z"
      }
    },
    hasMedia: overrides.hasMedia ?? false,
    mediaCount: overrides.mediaCount ?? 0,
    analyzedMediaCount: overrides.analyzedMediaCount ?? 0,
    indexedMediaCount: overrides.indexedMediaCount ?? 0,
    staleMediaCount: overrides.staleMediaCount ?? 0,
    missingMediaCount: overrides.missingMediaCount ?? 0,
    mediaAssetSyncStatus: overrides.mediaAssetSyncStatus ?? "not_applicable",
    firstMediaAssetId: overrides.firstMediaAssetId ?? null,
    firstMediaAssetStarred: overrides.firstMediaAssetStarred ?? false,
    topicLabels: overrides.topicLabels ?? ["OpenAI"],
    topTopicLabel: overrides.topTopicLabel ?? "OpenAI",
    topTopicHotnessScore: overrides.topTopicHotnessScore ?? 9.8,
    relativeEngagementScore: overrides.relativeEngagementScore ?? 8.6,
    relativeEngagementBand: overrides.relativeEngagementBand ?? "breakout"
  };
}

describe("buildTrendDigestBriefFromData", () => {
  it("builds a writing brief from recent topics and tweets", () => {
    const result = buildTrendDigestBriefFromData({
      topics: [
        createTopic({ topicId: "topic-1", label: "OpenAI" }),
        createTopic({
          topicId: "topic-2",
          label: "Meta",
          normalizedLabel: "meta",
          hotnessScore: 8.4,
          mostRecentAt: "2026-03-18T14:00:00.000Z",
          suggestedAngles: ["metaverse reversal"]
        })
      ],
      tweets: [
        createTweet({ tweetKey: "tweet-1", topTopicLabel: "OpenAI" }),
        createTweet({
          tweetKey: "tweet-2",
          tweet: {
            sourceName: "x",
            tweetId: "tweet-2",
            tweetUrl: "https://x.com/bob/status/2",
            authorHandle: "@bob",
            authorUsername: "bob",
            authorDisplayName: "Bob",
            authorProfileImageUrl: null,
            authorFollowerCount: 12000,
            createdAt: "2026-03-18T13:00:00.000Z",
            text: "Meta is retreating from the metaverse pitch",
            metrics: {
              replies: "45",
              reposts: "300",
              likes: "12K",
              bookmarks: null,
              views: null
            },
            media: [],
            extraction: {
              articleIndex: 1,
              extractedAt: "2026-03-18T13:03:00.000Z"
            }
          },
          topTopicLabel: "Meta",
          topicLabels: ["Meta"],
          topTopicHotnessScore: 8.4
        })
      ],
      now: new Date("2026-03-18T18:00:00.000Z")
    });

    expect(result.topicCount).toBe(2);
    expect(result.tweetCount).toBe(2);
    expect(result.topics).toHaveLength(2);
    expect(result.tweets).toHaveLength(2);
    expect(result.briefText).toContain("last 48 hours");
    expect(result.briefText).toContain("Topic signals:");
    expect(result.briefText).toContain("High-signal tweets:");
    expect(result.briefText).toContain("OpenAI");
    expect(result.briefText).toContain("Meta");
    expect(result.briefText).toContain("@alice");
    expect(result.briefText).toContain("rel=8.60");
    expect(result.briefText).toContain("likes=45000");
  });
});
