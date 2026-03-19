import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  runCliCommandMock,
  searchMemeTemplatesMock,
  getDashboardDataMock
} = vi.hoisted(() => ({
  runCliCommandMock: vi.fn(),
  searchMemeTemplatesMock: vi.fn(),
  getDashboardDataMock: vi.fn()
}));

vi.mock("@/src/server/cli-process", () => ({
  runCliCommand: runCliCommandMock
}));

vi.mock("@/src/server/meme-template-search", () => ({
  searchMemeTemplates: searchMemeTemplatesMock
}));

vi.mock("@/src/server/data", () => ({
  getDashboardData: getDashboardDataMock
}));

describe("CliFacetReplyMediaSearchProvider", () => {
  beforeEach(() => {
    runCliCommandMock.mockReset();
    searchMemeTemplatesMock.mockReset();
    getDashboardDataMock.mockReset();

    searchMemeTemplatesMock.mockReturnValue({
      candidates: [],
      queryOutcomes: [{ query: "reaction image", resultCount: 0 }]
    });

    getDashboardDataMock.mockReturnValue({
      tweetUsages: [
        {
          usageId: "usage-starred-hot",
          mediaAssetStarred: true,
          duplicateGroupUsageCount: 4,
          hotnessScore: 8.4
        },
        {
          usageId: "usage-plain",
          mediaAssetStarred: false,
          duplicateGroupUsageCount: 1,
          hotnessScore: 0.2
        }
      ]
    });
  });

  it("reranks facet candidates to prefer starred, repeated, and hot assets", async () => {
    runCliCommandMock.mockResolvedValue({
      exitCode: 0,
      stderr: "",
      stdout: JSON.stringify({
        command: "search facets",
        query: "reaction image",
        limit: 6,
        result_count: 2,
        results: [
          {
            result_id: "row-plain",
            matched_facet: {
              name: "scene_description",
              description: null,
              value: "plain result"
            },
            scores: {
              combined_score: 0.92
            },
            usage: {
              usage_id: "usage-plain",
              tweet_id: "tweet-plain"
            },
            tweet: {
              tweet_url: "https://x.com/example/status/plain",
              author_username: "plain",
              created_at: "2026-03-11T10:00:00.000Z",
              text: "plain"
            },
            media: {
              source_url: null,
              preview_url: null,
              poster_url: null,
              local_file_path: null,
              playable_file_path: null
            },
            analysis: {
              mediaKind: "image"
            },
            raw_metadata: {
              media_asset_id: "asset-plain"
            }
          },
          {
            result_id: "row-starred",
            matched_facet: {
              name: "scene_description",
              description: null,
              value: "starred result"
            },
            scores: {
              combined_score: 0.63
            },
            usage: {
              usage_id: "usage-starred-hot",
              tweet_id: "tweet-starred"
            },
            tweet: {
              tweet_url: "https://x.com/example/status/starred",
              author_username: "starred",
              created_at: "2026-03-11T11:00:00.000Z",
              text: "starred"
            },
            media: {
              source_url: null,
              preview_url: null,
              poster_url: null,
              local_file_path: null,
              playable_file_path: null
            },
            analysis: {
              mediaKind: "image"
            },
            raw_metadata: {
              media_asset_id: "asset-starred"
            }
          }
        ]
      })
    });

    const { CliFacetReplyMediaSearchProvider } = await import("@/src/server/reply-media-search");
    const provider = new CliFacetReplyMediaSearchProvider();
    const result = await provider.searchMany(["reaction image"]);

    expect(result.candidates.map((candidate) => candidate.usageId)).toEqual([
      "usage-starred-hot",
      "usage-plain"
    ]);
  });

  it("keeps partial results when one facet-search query times out", async () => {
    searchMemeTemplatesMock.mockReturnValue({
      candidates: [],
      queryOutcomes: [
        { query: "slow query", resultCount: 0 },
        { query: "reaction image", resultCount: 0 }
      ]
    });

    runCliCommandMock
      .mockRejectedValueOnce(new Error("Command timed out after 30000ms: /opt/homebrew/Cellar/node@22/22.22.0_1/bin/node"))
      .mockResolvedValueOnce({
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify({
          command: "search facets",
          query: "reaction image",
          limit: 6,
          result_count: 1,
          results: [
            {
              result_id: "row-starred",
              matched_facet: {
                name: "scene_description",
                description: null,
                value: "starred result"
              },
              scores: {
                combined_score: 0.63
              },
              usage: {
                usage_id: "usage-starred-hot",
                tweet_id: "tweet-starred"
              },
              tweet: {
                tweet_url: "https://x.com/example/status/starred",
                author_username: "starred",
                created_at: "2026-03-11T11:00:00.000Z",
                text: "starred"
              },
              media: {
                source_url: null,
                preview_url: null,
                poster_url: null,
                local_file_path: null,
                playable_file_path: null
              },
              analysis: {
                mediaKind: "image"
              },
              raw_metadata: {
                media_asset_id: "asset-starred"
              }
            }
          ]
        })
      });

    const { CliFacetReplyMediaSearchProvider } = await import("@/src/server/reply-media-search");
    const provider = new CliFacetReplyMediaSearchProvider();
    const result = await provider.searchMany(["slow query", "reaction image"]);

    expect(result.candidates.map((candidate) => candidate.usageId)).toEqual(["usage-starred-hot"]);
    expect(result.warning).toContain("slow query");
    expect(result.warning).toContain("Command timed out after 30000ms");
    expect(result.queryOutcomes).toEqual([
      { query: "slow query", resultCount: 0 },
      { query: "reaction image", resultCount: 1 }
    ]);
  });
});
