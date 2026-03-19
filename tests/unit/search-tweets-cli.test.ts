import { describe, expect, it } from "vitest";
import type { CapturedTweetPage } from "@/src/lib/types";
import { buildAgentTweetSearchPayload, parseSearchTweetsCliArgs } from "@/src/cli/search-tweets";

describe("parseSearchTweetsCliArgs", () => {
  it("accepts flag-based arguments", () => {
    expect(
      parseSearchTweetsCliArgs(["--query", "mask reveal", "--filter", "with_media", "--sort", "newest_asc", "--page", "2", "--limit", "50", "--jsonl"])
    ).toMatchObject({
      query: "mask reveal",
      filter: "with_media",
      sort: "newest_asc",
      page: 2,
      limit: 50,
      format: "jsonl"
    });
  });

  it("accepts a positional query and defaults the rest", () => {
    expect(parseSearchTweetsCliArgs(["terminal poster"])).toMatchObject({
      query: "terminal poster",
      filter: "all",
      sort: "newest_desc",
      page: 1,
      limit: 200,
      format: "json"
    });
  });
});

describe("buildAgentTweetSearchPayload", () => {
  it("emits page metadata and tweet fields", () => {
    const page: CapturedTweetPage = {
      tweets: [
        {
          tweetKey: "tweet-1",
          tweet: {
            sourceName: "test",
            tweetId: "tweet-1",
            tweetUrl: "https://x.com/example/status/1",
            authorHandle: "@example",
            authorUsername: "example",
            authorDisplayName: "Example",
            authorProfileImageUrl: null,
            authorFollowerCount: null,
            createdAt: "2026-03-11T10:00:00.000Z",
            text: "mask reveal energy",
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
              extractedAt: "2026-03-11T10:00:00.000Z"
            }
          },
          hasMedia: false,
          mediaCount: 0,
          analyzedMediaCount: 0,
          firstMediaAssetId: null,
          firstMediaAssetStarred: false,
          topicLabels: ["Mask Reveal"],
          topTopicLabel: "Mask Reveal",
          topTopicHotnessScore: 5.2,
          relativeEngagementScore: null,
          relativeEngagementBand: null
        }
      ],
      page: 2,
      pageSize: 50,
      totalResults: 125,
      totalPages: 3,
      hasPreviousPage: true,
      hasNextPage: true,
      query: "mask reveal",
      tweetFilter: "without_media",
      sort: "newest_desc",
      counts: {
        with_media: 30,
        without_media: 125,
        all: 155
      }
    };

    const payload = buildAgentTweetSearchPayload(page);

    expect(payload).toMatchObject({
      command: "search-tweets",
      query: "mask reveal",
      filter: "without_media",
      sort: "newest_desc",
      page: 2,
      limit: 50,
      total_results: 125,
      total_pages: 3
    });
    expect(payload.results[0]).toMatchObject({
      rank: 51,
      tweet_id: "tweet-1",
      author_username: "example",
      has_media: false,
      topic_labels: ["Mask Reveal"]
    });
  });
});
