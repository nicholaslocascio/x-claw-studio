import fs from "node:fs";
import path from "node:path";
import { inferMediaExtension, inferMediaExtensionFromBuffer, slugify, ensureDir, writeJson } from "@/src/lib/fs";
import { buildUsageId } from "@/src/lib/usage-id";
import type { CrawlManifest, ExtractedTweet, InterceptedMediaClass, InterceptedMediaRecord } from "@/src/lib/types";
import { extractTweetIdFromStatusUrl, normalizeXStatusUrl } from "@/src/lib/x-status-url";
import { queueMissingUsageAnalysis } from "@/src/server/auto-analysis";
import { getDashboardData } from "@/src/server/data";
import {
  collectMediaUsageIdsFromTweets,
  promoteStarredAssetVideo,
  setMediaAssetStarred,
  syncMediaAssetIndex,
  syncMediaAssetSummaries
} from "@/src/server/media-assets";
import { fetchXHomeTimeline, lookupXPostById } from "@/src/server/x-api";

const projectRoot = process.cwd();
const downloadImages = process.env.DOWNLOAD_IMAGES !== "0";
const downloadVideoPosters = process.env.DOWNLOAD_VIDEO_POSTERS !== "0";
const downloadVideos = process.env.DOWNLOAD_VIDEOS === "1";
const autoAnalyzeAfterCapture = process.env.AUTO_ANALYZE_AFTER_CRAWL !== "0";
const configuredMaxPages = Number(process.env.X_API_TIMELINE_MAX_PAGES || process.env.MAX_SCROLLS || 5);
const configuredMaxResults = Number(process.env.X_API_TIMELINE_MAX_RESULTS || 100);
const configuredExclude = (process.env.X_API_TIMELINE_EXCLUDE ?? "replies,retweets")
  .split(",")
  .map((value) => value.trim())
  .filter((value): value is "replies" | "retweets" => value === "replies" || value === "retweets");

export type XApiCaptureMode = "home_timeline" | "tweet_lookup";

export interface XApiCaptureResult {
  manifest: CrawlManifest;
  manifestPath: string;
  rawDir: string;
  topTweet: ExtractedTweet | null;
}

export interface RunXApiCaptureInput {
  mode: XApiCaptureMode;
  tweetUrl?: string | null;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 1000) {
    return `${Math.max(0, Math.round(ms))}ms`;
  }

  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

async function persistUrl(
  url: string,
  mediaClass: InterceptedMediaClass,
  mediaDir: string,
  persistedUrls: Set<string>
): Promise<InterceptedMediaRecord | null> {
  if (!url || persistedUrls.has(url)) {
    return null;
  }

  persistedUrls.add(url);
  if (
    (mediaClass === "image" && !downloadImages) ||
    (mediaClass === "video_poster" && !downloadVideoPosters) ||
    (mediaClass === "video" && !downloadVideos)
  ) {
    return {
      url,
      mediaClass,
      persisted: false,
      contentType: null
    };
  }

  try {
    const response = await fetch(url);
    const contentType = response.headers.get("content-type");
    const buffer = Buffer.from(await response.arrayBuffer());
    const safeName = slugify(url) || "asset";
    const binFilePath = path.join(mediaDir, `${safeName}.bin`);
    const preferredExtension =
      inferMediaExtension(url, contentType) ??
      inferMediaExtensionFromBuffer(buffer) ??
      ".bin";
    const preferredFilePath = path.join(mediaDir, `${safeName}${preferredExtension}`);
    fs.writeFileSync(binFilePath, buffer);

    let filePath = binFilePath;
    if (preferredFilePath !== binFilePath) {
      try {
        fs.writeFileSync(preferredFilePath, buffer);
        filePath = preferredFilePath;
      } catch (error) {
        console.warn(`Failed to write native media copy for ${url}. Falling back to .bin.`, error);
      }
    }

    return {
      url,
      mediaClass,
      persisted: true,
      contentType,
      filePath: path.relative(projectRoot, filePath)
    };
  } catch (error) {
    console.warn(`Failed to persist X API media ${url}.`, error);
    return {
      url,
      mediaClass,
      persisted: false,
      contentType: null
    };
  }
}

function pushInterceptedMedia(manifest: CrawlManifest, record: InterceptedMediaRecord | null): void {
  if (!record || manifest.interceptedMedia.some((entry) => entry.url === record.url)) {
    return;
  }

  manifest.interceptedMedia.push(record);
}

async function persistTweetMedia(
  tweet: ExtractedTweet,
  manifest: CrawlManifest,
  mediaDir: string,
  persistedUrls: Set<string>
): Promise<void> {
  for (const media of tweet.media) {
    if (media.mediaKind === "image") {
      pushInterceptedMedia(
        manifest,
        await persistUrl(media.sourceUrl ?? media.previewUrl ?? "", "image", mediaDir, persistedUrls)
      );
      continue;
    }

    pushInterceptedMedia(
      manifest,
      await persistUrl(media.sourceUrl ?? "", "video", mediaDir, persistedUrls)
    );
    pushInterceptedMedia(
      manifest,
      await persistUrl(media.posterUrl ?? media.previewUrl ?? "", "video_poster", mediaDir, persistedUrls)
    );
  }
}

async function syncCaptureOutputs(
  manifest: CrawlManifest,
  manifestPath: string,
  runStartedAt: number,
  startUrl: string | null
): Promise<void> {
  manifest.completedAt = new Date().toISOString();
  console.log(`Writing manifest -> ${path.relative(projectRoot, manifestPath)}`);
  writeJson(manifestPath, manifest);
  console.log(
    `Manifest written. tweets=${manifest.capturedTweets.length} media=${manifest.interceptedMedia.length} elapsed=${formatDuration(Date.now() - runStartedAt)}`
  );

  console.log("Loading dashboard data for media sync...");
  const data = getDashboardData();
  const newUsageIds = collectMediaUsageIdsFromTweets(manifest.capturedTweets);
  console.log(
    `Dashboard data loaded. manifests=${data.manifests.length} usages=${data.tweetUsages.length} elapsed=${formatDuration(Date.now() - runStartedAt)}`
  );

  const assetBuildStartedAt = Date.now();
  console.log(`Syncing media asset index for ${newUsageIds.length} new usage(s)...`);
  const assetSync = await syncMediaAssetIndex({
    usages: data.tweetUsages,
    manifests: data.manifests,
    usageIds: newUsageIds
  });
  const assetIndex = assetSync.index;
  console.log(
    `Media asset index synced. mode=${assetSync.mode} processed=${assetSync.processedUsageIds.length} touchedAssets=${assetSync.touchedAssetIds.length} assets=${assetIndex.assets.length} duration=${formatDuration(Date.now() - assetBuildStartedAt)} elapsed=${formatDuration(Date.now() - runStartedAt)}`
  );

  const summaryBuildStartedAt = Date.now();
  console.log("Syncing media asset summaries...");
  const summarySync = syncMediaAssetSummaries({
    usages: data.tweetUsages,
    assetIndex,
    assetIds: assetSync.touchedAssetIds
  });
  console.log(
    `Media asset summaries synced. mode=${summarySync.mode} touchedAssets=${summarySync.touchedAssetIds.length} duration=${formatDuration(Date.now() - summaryBuildStartedAt)} elapsed=${formatDuration(Date.now() - runStartedAt)}`
  );

  if (startUrl) {
    const topTweet =
      manifest.capturedTweets.find((tweet) => normalizeXStatusUrl(tweet.tweetUrl) === startUrl) ??
      manifest.capturedTweets[0] ??
      null;

    if (topTweet) {
      for (let mediaIndex = 0; mediaIndex < topTweet.media.length; mediaIndex += 1) {
        const usageId = buildUsageId(topTweet, mediaIndex);
        const assetId = assetIndex.usageToAssetId[usageId];
        if (!assetId) {
          continue;
        }

        if (setMediaAssetStarred(assetId, true)) {
          await promoteStarredAssetVideo(assetId);
          console.log(`Auto-starred top tweet asset ${assetId} for ${usageId}`);
        }
      }
    } else {
      console.warn(`No top tweet found to auto-star for ${startUrl}`);
    }
  }

  if (autoAnalyzeAfterCapture) {
    console.log(
      `Queueing detached missing-usage analysis after capture... elapsed=${formatDuration(Date.now() - runStartedAt)}`
    );
    queueMissingUsageAnalysis("x api capture");
  } else {
    console.log("Auto-analysis skipped because AUTO_ANALYZE_AFTER_CRAWL=0");
  }
}

export async function runXApiCapture(input: RunXApiCaptureInput): Promise<XApiCaptureResult> {
  const runStartedAt = Date.now();
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const runPrefix = input.mode === "home_timeline" ? "x-api-home" : "x-api-post";
  const rawDir = path.join(projectRoot, "data", "raw", `${runPrefix}-${runId}`);
  const htmlDir = path.join(rawDir, "html");
  const mediaDir = path.join(rawDir, "media");
  const manifestPath = path.join(rawDir, "manifest.json");
  const persistedUrls = new Set<string>();
  ensureDir(htmlDir);
  ensureDir(mediaDir);

  if (input.mode === "home_timeline") {
    const maxPages = Math.max(1, Math.min(32, configuredMaxPages));
    const maxResults = Math.max(5, Math.min(100, configuredMaxResults));
    console.log(`Fetching X home timeline via API. maxPages=${maxPages} maxResults=${maxResults}`);
    const timeline = await fetchXHomeTimeline({
      maxPages,
      maxResults,
      exclude: configuredExclude
    });

    const manifest: CrawlManifest = {
      runId: `${runPrefix}-${runId}`,
      startedAt: new Date().toISOString(),
      baseUrl: `https://api.x.com/2/users/${timeline.userId}/timelines/reverse_chronological`,
      maxScrolls: timeline.pages.length,
      downloadImages,
      downloadVideoPosters,
      downloadVideos,
      capturedTweets: [],
      interceptedMedia: []
    };

    for (const page of timeline.pages) {
      writeJson(path.join(htmlDir, `page-${String(page.page).padStart(3, "0")}.json`), page);
      for (const tweet of page.tweets) {
        if (manifest.capturedTweets.some((entry) => entry.tweetId === tweet.tweetId)) {
          continue;
        }

        await persistTweetMedia(tweet, manifest, mediaDir, persistedUrls);
        manifest.capturedTweets.push(tweet);
      }
      console.log(
        `page ${page.page}/${timeline.pages.length}: resultCount=${page.resultCount} uniqueTweets=${manifest.capturedTweets.length} media=${manifest.interceptedMedia.length}`
      );
    }

    console.log(
      `Capture summary: uniqueTweets=${manifest.capturedTweets.length} interceptedMedia=${manifest.interceptedMedia.length} elapsed=${formatDuration(Date.now() - runStartedAt)}`
    );
    await syncCaptureOutputs(manifest, manifestPath, runStartedAt, null);
    console.log(
      `crawl_x_api complete. manifest=${path.relative(projectRoot, manifestPath)} totalElapsed=${formatDuration(Date.now() - runStartedAt)}`
    );

    return {
      manifest,
      manifestPath,
      rawDir,
      topTweet: manifest.capturedTweets[0] ?? null
    };
  }

  const startUrl = normalizeXStatusUrl(input.tweetUrl ?? process.env.OPENCLAW_START_URL ?? null);
  if (!startUrl) {
    throw new Error("Tweet lookup capture requires OPENCLAW_START_URL to be set to a valid X status URL.");
  }

  const tweetId = extractTweetIdFromStatusUrl(startUrl);
  if (!tweetId) {
    throw new Error(`Could not extract a tweet id from ${startUrl}`);
  }

  console.log(`Fetching X post ${tweetId} via API.`);
  const lookup = await lookupXPostById(tweetId);
  const manifest: CrawlManifest = {
    runId: `${runPrefix}-${runId}`,
    startedAt: new Date().toISOString(),
    baseUrl: `https://api.x.com/2/tweets/${tweetId}`,
    maxScrolls: 1,
    downloadImages,
    downloadVideoPosters,
    downloadVideos,
    capturedTweets: [],
    interceptedMedia: []
  };

  writeJson(path.join(htmlDir, "lookup.json"), {
    tweetId,
    tweet: lookup.tweet
  });

  if (lookup.tweet) {
    await persistTweetMedia(lookup.tweet, manifest, mediaDir, persistedUrls);
    manifest.capturedTweets.push(lookup.tweet);
  }

  console.log(
    `Capture summary: uniqueTweets=${manifest.capturedTweets.length} interceptedMedia=${manifest.interceptedMedia.length} elapsed=${formatDuration(Date.now() - runStartedAt)}`
  );
  await syncCaptureOutputs(manifest, manifestPath, runStartedAt, startUrl);
  console.log(
    `capture_x_api_tweet complete. manifest=${path.relative(projectRoot, manifestPath)} totalElapsed=${formatDuration(Date.now() - runStartedAt)}`
  );

  return {
    manifest,
    manifestPath,
    rawDir,
    topTweet: lookup.tweet
  };
}
