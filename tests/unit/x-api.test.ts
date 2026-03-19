import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("x api mapping", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.X_BEARER_TOKEN = "test-token";
    process.env.X_USER_ID = "2244994945";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("maps home timeline payloads into extracted tweets with media", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            data: [
              {
                id: "200",
                author_id: "10",
                created_at: "2026-03-12T10:00:00.000Z",
                note_tweet: { text: "long-form text" },
                attachments: { media_keys: ["3_1", "7_1"] },
                public_metrics: {
                  reply_count: 2,
                  repost_count: 3,
                  like_count: 4,
                  impression_count: 5
                }
              }
            ],
            includes: {
              users: [
                {
                  id: "10",
                  username: "example",
                  name: "Example",
                  profile_image_url: "https://pbs.twimg.com/profile_images/example.jpg",
                  public_metrics: {
                    followers_count: 12345
                  }
                }
              ],
              media: [
                {
                  media_key: "3_1",
                  type: "photo",
                  url: "https://pbs.twimg.com/media/example.jpg"
                },
                {
                  media_key: "7_1",
                  type: "video",
                  preview_image_url: "https://pbs.twimg.com/ext_tw_video_thumb/example.jpg",
                  variants: [
                    {
                      content_type: "application/x-mpegURL",
                      url: "https://video.twimg.com/ext_tw_video/example.m3u8"
                    },
                    {
                      bit_rate: 832000,
                      content_type: "video/mp4",
                      url: "https://video.twimg.com/ext_tw_video/example.mp4"
                    }
                  ]
                }
              ]
            },
            meta: {
              result_count: 1
            }
          })
      })
    );

    const { fetchXHomeTimeline } = await import("@/src/server/x-api");
    const result = await fetchXHomeTimeline({
      maxPages: 1,
      maxResults: 25,
      exclude: ["replies", "retweets"]
    });

    expect(result.userId).toBe("2244994945");
    expect(result.tweets).toHaveLength(1);
    expect(result.tweets[0]).toMatchObject({
      tweetId: "200",
      tweetUrl: "https://x.com/example/status/200",
      authorHandle: "@example",
      authorUsername: "example",
      authorDisplayName: "Example",
      authorFollowerCount: 12345,
      text: "long-form text",
      metrics: {
        replies: "2",
        reposts: "3",
        likes: "4",
        views: "5"
      }
    });
    expect(result.tweets[0].media).toEqual([
      {
        mediaKind: "image",
        sourceUrl: "https://pbs.twimg.com/media/example.jpg",
        previewUrl: "https://pbs.twimg.com/media/example.jpg",
        posterUrl: null
      },
      {
        mediaKind: "video",
        sourceUrl: "https://video.twimg.com/ext_tw_video/example.mp4",
        previewUrl: "https://pbs.twimg.com/ext_tw_video_thumb/example.jpg",
        posterUrl: "https://pbs.twimg.com/ext_tw_video_thumb/example.jpg"
      }
    ]);
  });

  it("looks up a single post by id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            data: {
              id: "201",
              author_id: "10",
              text: "hello world"
            },
            includes: {
              users: [
                {
                  id: "10",
                  username: "lookup-user",
                  name: "Lookup User",
                  public_metrics: {
                    followers_count: 321
                  }
                }
              ]
            }
          })
      })
    );

    const { lookupXPostById } = await import("@/src/server/x-api");
    const result = await lookupXPostById("201");

    expect(result.tweet).toMatchObject({
      tweetId: "201",
      tweetUrl: "https://x.com/lookup-user/status/201",
      authorUserId: "10",
      text: "hello world",
      authorUsername: "lookup-user",
      authorFollowerCount: 321
    });
  });

  it("fetches new tweets for a watched account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            data: [
              {
                id: "301",
                author_id: "42",
                text: "priority account post",
                public_metrics: {
                  reply_count: 1,
                  repost_count: 2,
                  like_count: 3
                }
              }
            ],
            includes: {
              users: [
                {
                  id: "42",
                  username: "priorityacct",
                  name: "Priority Account",
                  public_metrics: {
                    followers_count: 4567
                  }
                }
              ]
            }
          })
      })
    );

    const { fetchXUserTweets } = await import("@/src/server/x-api");
    const result = await fetchXUserTweets({
      userId: "42",
      username: "priorityacct",
      maxResults: 20,
      sinceId: "300"
    });

    expect(result.tweets[0]).toMatchObject({
      sourceName: "x-api-user-tweets:priorityacct",
      tweetId: "301",
      tweetUrl: "https://x.com/priorityacct/status/301",
      authorUserId: "42",
      authorUsername: "priorityacct",
      authorFollowerCount: 4567,
      text: "priority account post"
    });
  });

  it("prefers the connected X account user id over X_USER_ID", async () => {
    vi.doMock("@/src/server/x-auth", () => ({
      readXAuthRecord: vi.fn(() => ({
        userId: "555606575"
      })),
      getXAccessTokenForApi: vi.fn(async () => "connected-user-token")
    }));

    const { resolveAuthenticatedXUserId } = await import("@/src/server/x-api");

    await expect(resolveAuthenticatedXUserId()).resolves.toBe("555606575");
  });

  it("only labels reverse chronological failures as auth issues when the API body indicates auth trouble", async () => {
    vi.doMock("@/src/server/x-auth", () => ({
      readXAuthRecord: vi.fn(() => ({
        userId: "555606575"
      })),
      getXAccessTokenForApi: vi.fn(async () => "connected-user-token")
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        text: async () =>
          JSON.stringify({
            title: "Invalid Request",
            detail: "The user id in the path does not match the authenticating user."
          })
      })
    );

    const { fetchXHomeTimeline } = await import("@/src/server/x-api");

    await expect(
      fetchXHomeTimeline({
        maxPages: 1,
        maxResults: 25
      })
    ).rejects.toThrow("The user id in the path does not match the authenticating user.");
  });
});
