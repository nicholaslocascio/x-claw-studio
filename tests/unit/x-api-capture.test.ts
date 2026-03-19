import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CrawlManifest, ExtractedTweet } from "@/src/lib/types";

const getDashboardData = vi.fn();
const collectMediaUsageIdsFromTweets = vi.fn();
const syncMediaAssetIndex = vi.fn();
const syncMediaAssetSummaries = vi.fn();
const syncFacetSearchAssetIndex = vi.fn();
const queueMissingUsageAnalysis = vi.fn();
const queueTopicAnalysisRefresh = vi.fn();

vi.mock("@/src/server/data", () => ({
  getDashboardData
}));

vi.mock("@/src/server/media-assets", () => ({
  collectMediaUsageIdsFromTweets,
  promoteStarredAssetVideo: vi.fn(async () => undefined),
  setMediaAssetStarred: vi.fn(() => false),
  syncMediaAssetIndex,
  syncMediaAssetSummaries
}));

vi.mock("@/src/server/chroma-facets", () => ({
  syncFacetSearchAssetIndex
}));

vi.mock("@/src/server/auto-analysis", () => ({
  queueMissingUsageAnalysis,
  queueTopicAnalysisRefresh
}));

vi.mock("@/src/server/x-api", () => ({
  fetchXHomeTimeline: vi.fn(),
  lookupXPostById: vi.fn()
}));

function createManifestFile(tweet: ExtractedTweet): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "x-api-capture-test-"));
  const manifestPath = path.join(tempDir, "manifest.json");
  const manifest: CrawlManifest = {
    runId: "run-1",
    startedAt: new Date(0).toISOString(),
    baseUrl: "https://x.com/home",
    maxScrolls: 1,
    downloadImages: true,
    downloadVideoPosters: true,
    downloadVideos: false,
    capturedTweets: [tweet],
    interceptedMedia: []
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest), "utf8");
  return manifestPath;
}

describe("runDeferredCapturePostProcess", () => {
  const originalEnv = { ...process.env };
  let manifestPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };

    const tweet: ExtractedTweet = {
      sourceName: "fixture",
      tweetId: "tweet-1",
      tweetUrl: "https://x.com/test/status/1",
      authorHandle: "@test",
      authorUsername: "test",
      authorDisplayName: "Test",
      authorProfileImageUrl: null,
      createdAt: null,
      text: "test tweet",
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
        extractedAt: new Date(0).toISOString()
      }
    };

    manifestPath = createManifestFile(tweet);

    getDashboardData.mockReturnValue({
      manifests: [],
      tweetUsages: [],
      capturedTweets: []
    });
    collectMediaUsageIdsFromTweets.mockReturnValue([]);
    syncMediaAssetIndex.mockResolvedValue({
      index: {
        assets: [],
        usageToAssetId: {}
      },
      mode: "incremental",
      processedUsageIds: [],
      touchedAssetIds: []
    });
    syncMediaAssetSummaries.mockReturnValue({
      file: { summaries: [] },
      mode: "incremental",
      touchedAssetIds: []
    });
    syncFacetSearchAssetIndex.mockResolvedValue({ indexedCount: 0 });
    queueMissingUsageAnalysis.mockReturnValue(true);
    queueTopicAnalysisRefresh.mockReturnValue(true);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    fs.rmSync(path.dirname(manifestPath), { recursive: true, force: true });
  });

  it("queues missing analysis and topic refresh after capture by default", async () => {
    const { runDeferredCapturePostProcess } = await import("@/src/server/x-api-capture");

    await runDeferredCapturePostProcess({
      manifestPath,
      runStartedAt: Date.now()
    });

    expect(queueMissingUsageAnalysis).toHaveBeenCalledWith("x api capture");
    expect(queueTopicAnalysisRefresh).toHaveBeenCalledWith("x api capture");
  });

  it("skips topic refresh when AUTO_ANALYZE_TOPICS_AFTER_CRAWL=0", async () => {
    process.env.AUTO_ANALYZE_TOPICS_AFTER_CRAWL = "0";

    const { runDeferredCapturePostProcess } = await import("@/src/server/x-api-capture");

    await runDeferredCapturePostProcess({
      manifestPath,
      runStartedAt: Date.now()
    });

    expect(queueMissingUsageAnalysis).toHaveBeenCalledWith("x api capture");
    expect(queueTopicAnalysisRefresh).not.toHaveBeenCalled();
  });
});
