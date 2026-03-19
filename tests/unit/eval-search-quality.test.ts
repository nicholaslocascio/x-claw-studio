import { describe, expect, it } from "vitest";
import type { HybridSearchRow } from "@/src/server/chroma-facets";
import { parseSearchEvalCliArgs, scoreSearchFixtureRows } from "@/src/cli/eval-search-quality";

describe("parseSearchEvalCliArgs", () => {
  it("uses the default fixture and output paths", () => {
    const options = parseSearchEvalCliArgs([]);

    expect(options.fixtureId).toBeNull();
    expect(options.fixturesPath.endsWith("/data/analysis/search-eval-fixtures.json")).toBe(true);
    expect(options.outPath.endsWith("/tmp/search-quality-eval.json")).toBe(true);
    expect(options.json).toBe(false);
  });

  it("accepts explicit fixture, path, and json flags", () => {
    const options = parseSearchEvalCliArgs([
      "--fixture",
      "female-person-query",
      "--fixtures",
      "tmp/fixtures.json",
      "--out",
      "tmp/report.json",
      "--json"
    ]);

    expect(options.fixtureId).toBe("female-person-query");
    expect(options.fixturesPath.endsWith("/tmp/fixtures.json")).toBe(true);
    expect(options.outPath.endsWith("/tmp/report.json")).toBe(true);
    expect(options.json).toBe(true);
  });
});

describe("scoreSearchFixtureRows", () => {
  it("counts positive and negative hits at rank thresholds", () => {
    const fixture = {
      id: "female-person-query",
      query: "female",
      relevantAssetIds: ["asset-good"],
      negativeAssetIds: ["asset-bad"],
      thresholds: {
        maxFirstRelevantRank: 2,
        minHitsAt5: 1,
        maxNegativeHitsAt5: 0
      }
    };

    const rows: HybridSearchRow[] = [
      {
        id: "row-1",
        document: "value: gentle song with female vocals",
        metadata: {
          usage_id: "usage-bad",
          asset_id: "asset-bad",
          facet_name: "video_music",
          facet_value: "female vocals"
        },
        media: {
          mediaAssetId: "asset-bad",
          mediaLocalFilePath: null,
          mediaPlayableFilePath: null,
          sourceUrl: null,
          previewUrl: null,
          posterUrl: null,
          tweetUrl: null,
          tweetText: "bad hit",
          authorHandle: null,
          authorUsername: null,
          authorDisplayName: null,
          createdAt: null,
          mediaIndex: 0,
          duplicateGroupId: null,
          duplicateGroupUsageCount: 1,
          hotnessScore: 0,
          mediaAssetStarred: false,
          mediaAssetUsageCount: 1,
          phashMatchCount: 0
        },
        vectorDistance: null,
        vectorScore: 0,
        lexicalScore: 0.9,
        combinedScore: 0.9,
        matchedBy: ["lexical"]
      },
      {
        id: "row-2",
        document: "value: true",
        metadata: {
          usage_id: "usage-good",
          asset_id: "asset-good",
          facet_name: "features_female",
          facet_value: "true"
        },
        media: {
          mediaAssetId: "asset-good",
          mediaLocalFilePath: null,
          mediaPlayableFilePath: null,
          sourceUrl: null,
          previewUrl: null,
          posterUrl: null,
          tweetUrl: null,
          tweetText: "good hit",
          authorHandle: null,
          authorUsername: null,
          authorDisplayName: null,
          createdAt: null,
          mediaIndex: 0,
          duplicateGroupId: null,
          duplicateGroupUsageCount: 2,
          hotnessScore: 0,
          mediaAssetStarred: true,
          mediaAssetUsageCount: 2,
          phashMatchCount: 0
        },
        vectorDistance: 0.1,
        vectorScore: 0.8,
        lexicalScore: 0.7,
        combinedScore: 0.78,
        matchedBy: ["vector", "lexical"]
      }
    ];

    const scored = scoreSearchFixtureRows(fixture, rows);

    expect(scored.firstRelevantRank).toBe(2);
    expect(scored.hitsAt5).toBe(1);
    expect(scored.negativeHitsAt5).toBe(1);
    expect(scored.vectorHitsAt5).toBe(1);
    expect(scored.vectorHitsAt10).toBe(1);
    expect(scored.passed).toBe(false);
    expect(scored.failures).toContain("negative hits@5 1 > 0");
  });
});
