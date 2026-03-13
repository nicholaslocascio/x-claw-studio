import { beforeEach, describe, expect, it, vi } from "vitest";

const getDashboardData = vi.fn();
const getCapturedTweetPage = vi.fn();

vi.mock("@/src/server/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/src/server/data")>();
  return {
    ...actual,
    getDashboardData,
    getCapturedTweetPage
  };
});

describe("/api/tweets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDashboardData.mockReturnValue({ capturedTweets: ["tweet-a", "tweet-b"] });
    getCapturedTweetPage.mockReturnValue({
      tweets: [],
      page: 2,
      pageSize: 200,
      totalResults: 250,
      totalPages: 2,
      hasPreviousPage: true,
      hasNextPage: false,
      query: "mask reveal",
      tweetFilter: "with_media",
      counts: {
        with_media: 250,
        without_media: 3,
        all: 253
      }
    });
  });

  it("returns paginated tweet results from the shared helper", async () => {
    const { GET } = await import("@/app/api/tweets/route");
    const response = await GET(
      new Request("http://localhost:4105/api/tweets?page=2&limit=500&query=mask%20reveal&filter=with_media")
    );

    expect(getDashboardData).toHaveBeenCalledTimes(1);
    expect(getCapturedTweetPage).toHaveBeenCalledWith({
      tweets: ["tweet-a", "tweet-b"],
      page: 2,
      pageSize: 500,
      query: "mask reveal",
      tweetFilter: "with_media"
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      page: 2,
      pageSize: 200,
      totalResults: 250,
      query: "mask reveal",
      tweetFilter: "with_media"
    });
  });
});
