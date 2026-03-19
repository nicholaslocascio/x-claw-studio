import { describe, expect, it } from "vitest";
import { buildCapturedTweetRecords, classifyMediaAssetSyncStatus, getCapturedTweetPage, getTopicClusterPage, getUsagePage } from "@/src/server/data";
import type { CapturedTweetRecord, ExtractedTweet, TopicClusterRecord, TweetUsageRecord, UsageAnalysis } from "@/src/lib/types";
import { buildUsageId } from "@/src/lib/usage-id";

function createTweet(overrides: Partial<ExtractedTweet>): ExtractedTweet {
  return {
    sourceName: "test",
    tweetId: "tweet-1",
    tweetUrl: "https://x.com/example/status/1",
    authorHandle: "@example",
    authorUsername: "@example",
    authorDisplayName: "Example",
    authorProfileImageUrl: null,
    createdAt: "2026-03-10T12:00:00.000Z",
    text: "example tweet",
    metrics: {
      replies: null,
      reposts: null,
      likes: null,
      bookmarks: null,
      views: null
    },
    media: [],
    extraction: {
      articleIndex: 0,
      extractedAt: "2026-03-10T12:00:00.000Z"
    },
    ...overrides
  };
}

function createAnalysis(tweet: ExtractedTweet, mediaIndex: number, status: UsageAnalysis["status"]): UsageAnalysis {
  return {
    usageId: buildUsageId(tweet, mediaIndex),
    tweetId: tweet.tweetId,
    mediaIndex,
    mediaKind: tweet.media[mediaIndex]?.mediaKind ?? "image",
    status,
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
  };
}

describe("buildCapturedTweetRecords", () => {
  it("keeps text-only tweets and marks them as non-media records", () => {
    const textOnlyTweet = createTweet({
      tweetId: "tweet-text-only",
      text: "no media here"
    });

    const records = buildCapturedTweetRecords({
      tweets: [textOnlyTweet],
      analysisMap: new Map()
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      tweetKey: "tweet-text-only",
      hasMedia: false,
      mediaCount: 0,
      analyzedMediaCount: 0,
      mediaAssetSyncStatus: "not_applicable"
    });
  });

  it("counts completed analyses only for tweets with media", () => {
    const mediaTweet = createTweet({
      tweetId: "tweet-media",
      media: [
        {
          mediaKind: "image",
          sourceUrl: "https://pbs.twimg.com/media/example.jpg",
          previewUrl: "https://pbs.twimg.com/media/example.jpg",
          posterUrl: "https://pbs.twimg.com/media/example.jpg"
        },
        {
          mediaKind: "video",
          sourceUrl: "https://video.twimg.com/example.mp4",
          previewUrl: "https://pbs.twimg.com/ext_tw_video_thumb/example.jpg",
          posterUrl: "https://pbs.twimg.com/ext_tw_video_thumb/example.jpg"
        }
      ]
    });

    const completeAnalysis = createAnalysis(mediaTweet, 0, "complete");
    const pendingAnalysis = createAnalysis(mediaTweet, 1, "pending");
    const records = buildCapturedTweetRecords({
      tweets: [mediaTweet],
      analysisMap: new Map([
        [completeAnalysis.usageId, completeAnalysis],
        [pendingAnalysis.usageId, pendingAnalysis]
      ])
    });

    expect(records[0]).toMatchObject({
      tweetKey: "tweet-media",
      hasMedia: true,
      mediaCount: 2,
      analyzedMediaCount: 1,
      indexedMediaCount: 0,
      missingMediaCount: 2,
      mediaAssetSyncStatus: "missing"
    });
  });

  it("surfaces indexed and stale media counts per tweet", () => {
    const mediaTweet = createTweet({
      tweetId: "tweet-sync",
      media: [
        {
          mediaKind: "image",
          sourceUrl: "https://example.com/1.jpg",
          previewUrl: "https://example.com/1.jpg",
          posterUrl: null
        },
        {
          mediaKind: "image",
          sourceUrl: "https://example.com/2.jpg",
          previewUrl: "https://example.com/2.jpg",
          posterUrl: null
        }
      ]
    });

    const records = buildCapturedTweetRecords({
      tweets: [mediaTweet],
      analysisMap: new Map(),
      usageSyncStatusMap: new Map([
        [buildUsageId(mediaTweet, 0), "indexed"],
        [buildUsageId(mediaTweet, 1), "stale"]
      ])
    });

    expect(records[0]).toMatchObject({
      indexedMediaCount: 1,
      staleMediaCount: 1,
      missingMediaCount: 0,
      mediaAssetSyncStatus: "stale"
    });
  });

  it("computes relative engagement when follower counts are available", () => {
    const tweet = createTweet({
      tweetId: "tweet-relative",
      authorFollowerCount: 5000,
      createdAt: "2026-03-18T10:00:00.000Z",
      metrics: {
        replies: "25",
        reposts: "50",
        likes: "1200",
        bookmarks: "90",
        views: "30000"
      }
    });

    const records = buildCapturedTweetRecords({
      tweets: [tweet],
      analysisMap: new Map()
    });

    expect(records[0].relativeEngagementScore).not.toBeNull();
    expect(records[0].relativeEngagementBand).toBe("breakout");
  });
});

describe("classifyMediaAssetSyncStatus", () => {
  it("marks media without an asset mapping as missing", () => {
    expect(
      classifyMediaAssetSyncStatus({
        hasMedia: true,
        mediaAssetId: null,
        extractedAt: "2026-03-13T10:00:00.000Z",
        assetIndexGeneratedAt: "2026-03-13T10:05:00.000Z"
      })
    ).toBe("missing");
  });

  it("marks mapped media newer than the asset index as stale", () => {
    expect(
      classifyMediaAssetSyncStatus({
        hasMedia: true,
        mediaAssetId: "asset-1",
        extractedAt: "2026-03-13T10:10:00.000Z",
        assetIndexGeneratedAt: "2026-03-13T10:05:00.000Z"
      })
    ).toBe("stale");
  });
});

function createCapturedTweetRecord(overrides: Partial<CapturedTweetRecord>): CapturedTweetRecord {
  const { tweet: overrideTweet, ...recordOverrides } = overrides;
  const baseTweet = createTweet({
    tweetId: "tweet-record",
    text: "example tweet",
    ...overrideTweet
  });
  const tweet = overrideTweet ? { ...baseTweet, ...overrideTweet } : baseTweet;

  return Object.assign({
    tweetKey: tweet.tweetId ?? "tweet-record",
    tweet,
    hasMedia: tweet.media.length > 0,
    mediaCount: tweet.media.length,
    analyzedMediaCount: 0,
    indexedMediaCount: tweet.media.length,
    staleMediaCount: 0,
    missingMediaCount: 0,
    mediaAssetSyncStatus: tweet.media.length > 0 ? "indexed" : "not_applicable",
    firstMediaAssetId: null,
    firstMediaAssetStarred: false,
    topicLabels: [],
    topTopicLabel: null,
    topTopicHotnessScore: 0,
    relativeEngagementScore: null,
    relativeEngagementBand: null
  }, recordOverrides, { tweet });
}

function createTopicClusterRecord(overrides: Partial<TopicClusterRecord>): TopicClusterRecord {
  return {
    topicId: "topic-1",
    label: "OpenAI Pricing",
    normalizedLabel: "openai pricing",
    kind: "phrase",
    signalCount: 2,
    tweetCount: 2,
    mediaUsageCount: 1,
    textOnlyTweetCount: 1,
    uniqueAuthorCount: 2,
    totalLikes: 200,
    recentTweetCount24h: 1,
    mostRecentAt: "2026-03-13T12:00:00.000Z",
    oldestAt: "2026-03-12T12:00:00.000Z",
    hotnessScore: 8.4,
    isStale: false,
    sources: ["llm_topic"],
    representativeTweetKeys: ["tweet-1"],
    representativeTweets: [
      {
        tweetKey: "tweet-1",
        tweetId: "tweet-1",
        authorUsername: "alpha",
        text: "OpenAI pricing keeps moving",
        createdAt: "2026-03-13T12:00:00.000Z"
      }
    ],
    suggestedAngles: ["Write the second-order take on OpenAI pricing."],
    ...overrides
  };
}

function createUsageRecord(overrides: Partial<TweetUsageRecord>): TweetUsageRecord {
  const overrideTweet = overrides.tweet ?? {};
  const mediaIndex = overrides.mediaIndex ?? 0;
  const tweet = createTweet({
    tweetId: "tweet-usage",
    text: "usage tweet",
    media: [
      {
        mediaKind: "image",
        sourceUrl: "https://example.com/usage.jpg",
        previewUrl: "https://example.com/usage.jpg",
        posterUrl: null
      }
    ],
    ...overrideTweet
  });
  const analysis = createAnalysis(tweet, mediaIndex, overrides.analysis?.status ?? "complete");

  return {
    usageId: buildUsageId(tweet, mediaIndex),
    tweet,
    mediaIndex,
    analysis: {
      ...analysis,
      ...overrides.analysis
    },
    mediaAssetId: `asset-${tweet.tweetId}`,
    mediaLocalFilePath: null,
    mediaPlayableFilePath: null,
    mediaAssetStarred: false,
    mediaAssetUsageCount: 1,
    phashMatchCount: 0,
    duplicateGroupId: null,
    duplicateGroupUsageCount: 1,
    hotnessScore: 1,
    ...overrides
  };
}

describe("getCapturedTweetPage", () => {
  it("applies query and filter before paginating", () => {
    const tweets = [
      createCapturedTweetRecord({
        tweet: createTweet({
          tweetId: "3",
          createdAt: "2026-03-10T12:00:00.000Z",
          text: "banana update",
          media: [
            {
              mediaKind: "image",
              sourceUrl: "https://example.com/3.jpg",
              previewUrl: "https://example.com/3.jpg",
              posterUrl: "https://example.com/3.jpg"
            }
          ]
        }),
        hasMedia: true,
        mediaCount: 1
      }),
      createCapturedTweetRecord({
        tweet: createTweet({
          tweetId: "2",
          createdAt: "2026-03-09T12:00:00.000Z",
          text: "banana without media"
        }),
        hasMedia: false,
        mediaCount: 0
      }),
      createCapturedTweetRecord({
        tweet: createTweet({
          tweetId: "1",
          createdAt: "2026-03-08T12:00:00.000Z",
          text: "banana again",
          media: [
            {
              mediaKind: "image",
              sourceUrl: "https://example.com/1.jpg",
              previewUrl: "https://example.com/1.jpg",
              posterUrl: "https://example.com/1.jpg"
            }
          ]
        }),
        hasMedia: true,
        mediaCount: 1
      })
    ];

    const page = getCapturedTweetPage({
      tweets,
      query: "banana",
      tweetFilter: "with_media",
      page: 1,
      pageSize: 1
    });

    expect(page.counts).toEqual({
      with_media: 2,
      without_media: 1,
      all: 3
    });
    expect(page.totalResults).toBe(2);
    expect(page.totalPages).toBe(2);
    expect(page.tweets.map((entry) => entry.tweet.tweetId)).toEqual(["3"]);
    expect(page.hasNextPage).toBe(true);
  });

  it("clamps out-of-range pages to the last available page", () => {
    const tweets = [
      createCapturedTweetRecord({
        tweet: createTweet({
          tweetId: "1",
          createdAt: "2026-03-08T12:00:00.000Z",
          text: "first"
        })
      }),
      createCapturedTweetRecord({
        tweet: createTweet({
          tweetId: "2",
          createdAt: "2026-03-09T12:00:00.000Z",
          text: "second"
        })
      }),
      createCapturedTweetRecord({
        tweet: createTweet({
          tweetId: "3",
          createdAt: "2026-03-10T12:00:00.000Z",
          text: "third"
        })
      })
    ];

    const page = getCapturedTweetPage({
      tweets,
      page: 99,
      pageSize: 2
    });

    expect(page.page).toBe(2);
    expect(page.totalPages).toBe(2);
    expect(page.tweets.map((entry) => entry.tweet.tweetId)).toEqual(["1"]);
    expect(page.hasPreviousPage).toBe(true);
    expect(page.hasNextPage).toBe(false);
  });

  it("caps page size at 200 even when a larger limit is requested", () => {
    const tweets = Array.from({ length: 250 }, (_, index) =>
      createCapturedTweetRecord({
        tweet: createTweet({
          tweetId: `tweet-${index}`,
          createdAt: `2026-03-${String((index % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
          text: `tweet ${index}`
        })
      })
    );

    const page = getCapturedTweetPage({
      tweets,
      page: 1,
      pageSize: 500
    });

    expect(page.pageSize).toBe(200);
    expect(page.tweets).toHaveLength(200);
    expect(page.totalPages).toBe(2);
  });

  it("supports ascending and descending captured tweet sort orders", () => {
    const tweets = [
      createCapturedTweetRecord({
        tweet: createTweet({
          tweetId: "1",
          createdAt: "2026-03-08T12:00:00.000Z"
        })
      }),
      createCapturedTweetRecord({
        tweet: createTweet({
          tweetId: "2",
          createdAt: "2026-03-09T12:00:00.000Z"
        })
      }),
      createCapturedTweetRecord({
        tweet: createTweet({
          tweetId: "3",
          createdAt: "2026-03-10T12:00:00.000Z"
        })
      })
    ];

    expect(getCapturedTweetPage({ tweets, sort: "newest_desc" }).tweets.map((entry) => entry.tweet.tweetId)).toEqual(["3", "2", "1"]);
    expect(getCapturedTweetPage({ tweets, sort: "newest_asc" }).tweets.map((entry) => entry.tweet.tweetId)).toEqual(["1", "2", "3"]);
    expect(getCapturedTweetPage({ tweets, sort: "newest" }).sort).toBe("newest_desc");
  });
});

describe("getUsagePage", () => {
  it("supports ascending and descending usage sort orders", () => {
    const usages = [
      createUsageRecord({
        tweet: createTweet({
          tweetId: "tweet-new",
          createdAt: "2026-03-14T12:00:00.000Z",
          text: "newest usage",
          media: [{ mediaKind: "image", sourceUrl: "https://example.com/new.jpg", previewUrl: "https://example.com/new.jpg", posterUrl: null }]
        }),
        duplicateGroupUsageCount: 3,
        hotnessScore: 9
      }),
      createUsageRecord({
        tweet: createTweet({
          tweetId: "tweet-mid",
          createdAt: "2026-03-13T12:00:00.000Z",
          text: "middle usage",
          media: [{ mediaKind: "image", sourceUrl: "https://example.com/mid.jpg", previewUrl: "https://example.com/mid.jpg", posterUrl: null }]
        }),
        duplicateGroupUsageCount: 2,
        hotnessScore: 5
      }),
      createUsageRecord({
        tweet: createTweet({
          tweetId: "tweet-old",
          createdAt: "2026-03-12T12:00:00.000Z",
          text: "oldest usage",
          media: [{ mediaKind: "image", sourceUrl: "https://example.com/old.jpg", previewUrl: "https://example.com/old.jpg", posterUrl: null }]
        }),
        duplicateGroupUsageCount: 1,
        hotnessScore: 2
      })
    ];

    expect(getUsagePage({ usages, sort: "newest_desc", hideDuplicateAssets: "0" }).usages.map((usage) => usage.tweet.tweetId)).toEqual([
      "tweet-new",
      "tweet-mid",
      "tweet-old"
    ]);
    expect(getUsagePage({ usages, sort: "newest_asc", hideDuplicateAssets: "0" }).usages.map((usage) => usage.tweet.tweetId)).toEqual([
      "tweet-old",
      "tweet-mid",
      "tweet-new"
    ]);
    expect(getUsagePage({ usages, sort: "duplicates_asc", hideDuplicateAssets: "0" }).usages.map((usage) => usage.tweet.tweetId)).toEqual([
      "tweet-old",
      "tweet-mid",
      "tweet-new"
    ]);
    expect(getUsagePage({ usages, sort: "hotness_asc", hideDuplicateAssets: "0" }).usages.map((usage) => usage.tweet.tweetId)).toEqual([
      "tweet-old",
      "tweet-mid",
      "tweet-new"
    ]);
  });

  it("maps legacy descending sort aliases to the new explicit values", () => {
    const usages = [createUsageRecord({ duplicateGroupUsageCount: 1, hotnessScore: 2 }), createUsageRecord({ tweet: createTweet({ tweetId: "tweet-2" }) })];

    expect(getUsagePage({ usages, sort: "newest", hideDuplicateAssets: "0" }).sort).toBe("newest_desc");
    expect(getUsagePage({ usages, sort: "duplicates", hideDuplicateAssets: "0" }).sort).toBe("duplicates_desc");
    expect(getUsagePage({ usages, sort: "hotness", hideDuplicateAssets: "0" }).sort).toBe("hotness_desc");
  });

  it("lets starred or repeated use a configurable minimum repeat count", () => {
    const usages = [
      createUsageRecord({
        tweet: createTweet({ tweetId: "tweet-starred" }),
        mediaAssetStarred: true,
        duplicateGroupUsageCount: 1
      }),
      createUsageRecord({
        tweet: createTweet({ tweetId: "tweet-repeat-2" }),
        duplicateGroupUsageCount: 2
      }),
      createUsageRecord({
        tweet: createTweet({ tweetId: "tweet-repeat-4" }),
        duplicateGroupUsageCount: 4
      }),
      createUsageRecord({
        tweet: createTweet({ tweetId: "tweet-similar" }),
        duplicateGroupUsageCount: 1,
        phashMatchCount: 3
      })
    ];

    const defaultPage = getUsagePage({
      usages,
      matchFilter: "starred_or_duplicates",
      hideDuplicateAssets: "0"
    });
    const thresholdPage = getUsagePage({
      usages,
      matchFilter: "starred_or_duplicates",
      repeatMinimum: "4",
      hideDuplicateAssets: "0"
    });

    expect(defaultPage.repeatMinimum).toBe(2);
    expect(defaultPage.counts.starred_or_duplicates).toBe(3);
    expect(defaultPage.usages.map((usage) => usage.tweet.tweetId)).toEqual([
      "tweet-repeat-4",
      "tweet-repeat-2",
      "tweet-starred"
    ]);

    expect(thresholdPage.repeatMinimum).toBe(4);
    expect(thresholdPage.counts.starred_or_duplicates).toBe(2);
    expect(thresholdPage.usages.map((usage) => usage.tweet.tweetId)).toEqual([
      "tweet-repeat-4",
      "tweet-starred"
    ]);
  });

  it("lets repeated use a configurable minimum repeat count", () => {
    const usages = [
      createUsageRecord({
        tweet: createTweet({ tweetId: "tweet-repeat-2" }),
        duplicateGroupUsageCount: 2
      }),
      createUsageRecord({
        tweet: createTweet({ tweetId: "tweet-repeat-4" }),
        duplicateGroupUsageCount: 4
      }),
      createUsageRecord({
        tweet: createTweet({ tweetId: "tweet-similar" }),
        duplicateGroupUsageCount: 1,
        phashMatchCount: 2
      }),
      createUsageRecord({
        tweet: createTweet({ tweetId: "tweet-single" }),
        duplicateGroupUsageCount: 1
      })
    ];

    const defaultPage = getUsagePage({
      usages,
      matchFilter: "matched",
      hideDuplicateAssets: "0"
    });
    const thresholdPage = getUsagePage({
      usages,
      matchFilter: "matched",
      repeatMinimum: "4",
      hideDuplicateAssets: "0"
    });

    expect(defaultPage.counts.matched).toBe(2);
    expect(defaultPage.usages.map((usage) => usage.tweet.tweetId)).toEqual([
      "tweet-repeat-4",
      "tweet-repeat-2"
    ]);

    expect(thresholdPage.repeatMinimum).toBe(4);
    expect(thresholdPage.counts.matched).toBe(1);
    expect(thresholdPage.usages.map((usage) => usage.tweet.tweetId)).toEqual([
      "tweet-repeat-4"
    ]);
  });
});

describe("getTopicClusterPage", () => {
  it("applies query, freshness, kind, sort, and pagination together", () => {
    const topics = [
      createTopicClusterRecord({
        topicId: "fresh-brand",
        label: "OpenAI Pricing",
        kind: "brand",
        totalLikes: 400,
        recentTweetCount24h: 2,
        tweetCount: 3,
        mostRecentAt: "2026-03-14T10:00:00.000Z",
        oldestAt: "2026-03-14T08:00:00.000Z",
        hotnessScore: 12.5
      }),
      createTopicClusterRecord({
        topicId: "stale-brand",
        label: "OpenAI Policy",
        kind: "brand",
        totalLikes: 100,
        recentTweetCount24h: 0,
        mostRecentAt: "2026-03-09T10:00:00.000Z",
        oldestAt: "2026-03-08T10:00:00.000Z",
        hotnessScore: 4.2,
        isStale: true
      }),
      createTopicClusterRecord({
        topicId: "fresh-entity",
        label: "Meta Leak",
        normalizedLabel: "meta leak",
        kind: "entity",
        totalLikes: 800,
        recentTweetCount24h: 3,
        tweetCount: 5,
        mostRecentAt: "2026-03-14T11:00:00.000Z",
        oldestAt: "2026-03-13T11:00:00.000Z",
        hotnessScore: 14.1,
        representativeTweets: [
          {
            tweetKey: "tweet-meta",
            tweetId: "tweet-meta",
            authorUsername: "gamma",
            text: "Meta leak is picking up steam",
            createdAt: "2026-03-14T11:00:00.000Z"
          }
        ],
        suggestedAngles: ["Summarize what changed around Meta leak."]
      })
    ];

    const result = getTopicClusterPage({
      topics,
      page: 1,
      pageSize: 1,
      query: "openai",
      freshness: "fresh",
      kind: "brand",
      sort: "newest_desc",
      nowMs: Date.parse("2026-03-14T12:00:00.000Z")
    });

    expect(result.totalResults).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.sort).toBe("newest_desc");
    expect(result.freshness).toBe("fresh");
    expect(result.kind).toBe("brand");
    expect(result.counts.all).toBe(2);
    expect(result.counts.fresh).toBe(1);
    expect(result.counts.stale).toBe(1);
    expect(result.topics.map((topic) => topic.topicId)).toEqual(["fresh-brand"]);
  });

  it("supports ascending and descending topic sort orders", () => {
    const topics = [
      createTopicClusterRecord({
        topicId: "topic-c",
        label: "Gamma",
        tweetCount: 9,
        totalLikes: 300,
        recentTweetCount24h: 4,
        mostRecentAt: "2026-03-14T12:00:00.000Z",
        hotnessScore: 12
      }),
      createTopicClusterRecord({
        topicId: "topic-b",
        label: "Beta",
        tweetCount: 5,
        totalLikes: 200,
        recentTweetCount24h: 2,
        mostRecentAt: "2026-03-13T12:00:00.000Z",
        hotnessScore: 8
      }),
      createTopicClusterRecord({
        topicId: "topic-a",
        label: "Alpha",
        tweetCount: 1,
        totalLikes: 100,
        recentTweetCount24h: 1,
        mostRecentAt: "2026-03-12T12:00:00.000Z",
        hotnessScore: 3
      })
    ];

    expect(getTopicClusterPage({ topics, sort: "hotness_desc" }).topics.map((topic) => topic.topicId)).toEqual(["topic-c", "topic-b", "topic-a"]);
    expect(getTopicClusterPage({ topics, sort: "hotness_asc" }).topics.map((topic) => topic.topicId)).toEqual(["topic-a", "topic-b", "topic-c"]);
    expect(getTopicClusterPage({ topics, sort: "tweets_asc" }).topics.map((topic) => topic.topicId)).toEqual(["topic-a", "topic-b", "topic-c"]);
    expect(getTopicClusterPage({ topics, sort: "oldest" }).sort).toBe("newest_asc");
  });
});
