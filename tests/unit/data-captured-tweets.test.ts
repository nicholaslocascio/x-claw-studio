import { describe, expect, it } from "vitest";
import { buildCapturedTweetRecords, getCapturedTweetPage } from "@/src/server/data";
import type { CapturedTweetRecord, ExtractedTweet, UsageAnalysis } from "@/src/lib/types";
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
      analyzedMediaCount: 0
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
      analyzedMediaCount: 1
    });
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
    firstMediaAssetId: null,
    firstMediaAssetStarred: false,
    topicLabels: [],
    topTopicLabel: null,
    topTopicHotnessScore: 0
  }, recordOverrides, { tweet });
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
});
