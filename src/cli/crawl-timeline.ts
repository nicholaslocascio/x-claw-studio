import "@/src/lib/env";
import fs from "node:fs";
import path from "node:path";
import { chromium, type LaunchOptions, type Response } from "playwright";
import { ensureDir, inferMediaExtension, inferMediaExtensionFromBuffer, slugify, writeJson } from "@/src/lib/fs";
import { extractTweetsFromHtml } from "@/src/lib/extract-tweets";
import { createScrollHumanizer, type ScrollHumanizerDriver } from "@/src/lib/scroll-humanizer";
import { queueMissingUsageAnalysis, queueTopicAnalysisRefresh } from "@/src/server/auto-analysis";
import { syncFacetSearchAssetIndex } from "@/src/server/chroma-facets";
import { getDashboardData } from "@/src/server/data";
import { collectMediaUsageIdsFromTweets, syncMediaAssetIndex, syncMediaAssetSummaries } from "@/src/server/media-assets";
import type {
  CrawlManifest,
  ExtractedTweet,
  InterceptedMediaClass,
  InterceptedMediaRecord
} from "@/src/lib/types";

const projectRoot = process.cwd();
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const rawDir = path.join(projectRoot, "data", "raw", runId);
const htmlDir = path.join(rawDir, "html");
const manifestPath = path.join(rawDir, "manifest.json");
const mediaDir = path.join(rawDir, "media");

ensureDir(htmlDir);
ensureDir(mediaDir);

const baseUrl = process.env.X_TIMELINE_URL || "https://x.com/home";
const maxScrolls = Number(process.env.MAX_SCROLLS || 125);
const scrollPauseMs = Number(process.env.SCROLL_PAUSE_MS || 2500);
const downloadImages = process.env.DOWNLOAD_IMAGES !== "0";
const downloadVideoPosters = process.env.DOWNLOAD_VIDEO_POSTERS !== "0";
const downloadVideos = process.env.DOWNLOAD_VIDEOS === "1";
const autoAnalyzeAfterCrawl = process.env.AUTO_ANALYZE_AFTER_CRAWL !== "0";
const autoAnalyzeTopicsAfterCrawl =
  process.env.AUTO_ANALYZE_TOPICS_AFTER_CRAWL !== undefined
    ? process.env.AUTO_ANALYZE_TOPICS_AFTER_CRAWL !== "0"
    : autoAnalyzeAfterCrawl;

const humanizer = createScrollHumanizer({
  capturePauseMs: scrollPauseMs,
  scrollStepMinPx: 1400,
  scrollStepMaxPx: 3400,
  scrollStepsMin: 1,
  scrollStepsMax: 3,
  scrollStepPauseMinMs: 350,
  scrollStepPauseMaxMs: 1100
});

const downloaded = new Set<string>();
const seenTweets = new Set<string>();
const manifest: CrawlManifest = {
  runId,
  startedAt: new Date().toISOString(),
  baseUrl,
  maxScrolls,
  downloadImages,
  downloadVideoPosters,
  downloadVideos,
  capturedTweets: [],
  interceptedMedia: []
};

function classifyMediaUrl(url: string): InterceptedMediaClass | null {
  if (url.includes("video.twimg.com/")) {
    return "video";
  }

  if (
    url.includes("pbs.twimg.com/amplify_video_thumb/") ||
    url.includes("pbs.twimg.com/ext_tw_video_thumb/")
  ) {
    return "video_poster";
  }

  if (url.includes("pbs.twimg.com/media/")) {
    return "image";
  }

  return null;
}

async function persistUrl(
  url: string,
  mediaClass: InterceptedMediaClass
): Promise<InterceptedMediaRecord | null> {
  if (downloaded.has(url)) {
    return null;
  }

  downloaded.add(url);
  const safeName = slugify(url) || "asset";
  try {
    const response = await fetch(url);
    const contentType = response.headers.get("content-type");
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
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
    console.warn(`Failed to persist intercepted media ${url}.`, error);
    return {
      url,
      mediaClass,
      persisted: false,
      contentType: null
    };
  }
}

function pushInterceptedMedia(record: InterceptedMediaRecord): void {
  if (manifest.interceptedMedia.some((entry) => entry.url === record.url)) {
    return;
  }

  manifest.interceptedMedia.push(record);
}

async function maybeDownloadResponse(response: Response): Promise<void> {
  const url = response.url();
  const mediaClass = classifyMediaUrl(url);

  if (!mediaClass || manifest.interceptedMedia.some((entry) => entry.url === url)) {
    return;
  }

  if (mediaClass === "video") {
    if (downloadVideos) {
      const persisted = await persistUrl(url, mediaClass);
      if (persisted) {
        pushInterceptedMedia(persisted);
      }
      return;
    }

    pushInterceptedMedia({
      url,
      mediaClass,
      persisted: false,
      contentType: response.headers()["content-type"] ?? null
    });
    return;
  }

  if (mediaClass === "image" && !downloadImages) {
    pushInterceptedMedia({
      url,
      mediaClass,
      persisted: false,
      contentType: response.headers()["content-type"] ?? null
    });
    return;
  }

  if (mediaClass === "video_poster" && !downloadVideoPosters) {
    pushInterceptedMedia({
      url,
      mediaClass,
      persisted: false,
      contentType: response.headers()["content-type"] ?? null
    });
    return;
  }

  const persisted = await persistUrl(url, mediaClass);
  if (persisted) {
    pushInterceptedMedia(persisted);
  }
}

async function persistTweetPosterMedia(tweet: ExtractedTweet): Promise<void> {
  for (const media of tweet.media) {
    const isVideo =
      media.mediaKind === "video" ||
      media.mediaKind === "video_hls" ||
      media.mediaKind === "video_blob";

    if (!isVideo || !media.posterUrl || !downloadVideoPosters) {
      continue;
    }

    if (manifest.interceptedMedia.some((entry) => entry.url === media.posterUrl)) {
      continue;
    }

    const persisted = await persistUrl(media.posterUrl, "video_poster");
    if (persisted) {
      pushInterceptedMedia(persisted);
    }
  }
}

function isMissingBrowserExecutable(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("Executable doesn't exist")
  );
}

async function launchBrowser() {
  const launchTargets: Array<{
    label: string;
    options: LaunchOptions;
  }> = [
    {
      label: "playwright chromium",
      options: { headless: false }
    },
    {
      label: "installed Google Chrome channel",
      options: { channel: "chrome", headless: false }
    }
  ];

  let lastError: unknown;

  for (const target of launchTargets) {
    try {
      console.log(`Launching browser via ${target.label}...`);
      return await chromium.launch(target.options);
    } catch (error) {
      lastError = error;
      if (!isMissingBrowserExecutable(error)) {
        throw error;
      }

      console.warn(
        `Browser launch via ${target.label} failed because the executable is missing.`
      );
    }
  }

  throw new Error(
    "Could not launch a browser for timeline crawl. Tried Playwright Chromium and the installed Google Chrome channel. Run `npx playwright install chromium` or install Google Chrome locally."
  );
}

async function run(): Promise<void> {
  const browser = await launchBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();
  const driver: ScrollHumanizerDriver = {
    refresh: () => page.reload({ waitUntil: "domcontentloaded" }).then(() => undefined),
    wait: (ms: number) => page.waitForTimeout(ms),
    wheelTick: ({ deltaY }) => page.mouse.wheel(0, deltaY),
    wheelBurst: async (steps) => {
      for (const step of steps) {
        await page.mouse.wheel(0, step.deltaY);
        if (step.delayMs > 0) {
          await page.waitForTimeout(step.delayMs);
        }
      }
    }
  };

  page.on("response", (response) => {
    maybeDownloadResponse(response).catch((error: Error) => {
      console.error(`Failed to persist ${response.url()}: ${error.message}`);
    });
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  console.log(`Open ${baseUrl} in the launched browser and make sure you are logged in.`);
  console.log("This script will start sampling the DOM immediately and keep scrolling.");
  await humanizer.refreshAtStart(driver);

  for (let i = 0; i < maxScrolls; i += 1) {
    await humanizer.pauseBeforeCapture(driver);

    const articles = await page
      .locator('article[data-testid="tweet"]')
      .evaluateAll((nodes) => nodes.map((node) => node.outerHTML));

    for (const articleHtml of articles) {
      const tweets = extractTweetsFromHtml(articleHtml, `timeline-scroll-${i}`);
      for (const tweet of tweets) {
        const dedupeKey = tweet.tweetId || `${tweet.authorUsername}:${tweet.text}`;
        if (seenTweets.has(dedupeKey)) {
          continue;
        }

        seenTweets.add(dedupeKey);
        await persistTweetPosterMedia(tweet);
        manifest.capturedTweets.push(tweet);
      }
    }

    const snapshotPath = path.join(
      htmlDir,
      `scroll-${String(i).padStart(3, "0")}.html`
    );
    fs.writeFileSync(snapshotPath, await page.content());
    console.log(
      `scroll ${i + 1}/${maxScrolls}: tweets=${manifest.capturedTweets.length} media=${manifest.interceptedMedia.length}`
    );
    await humanizer.scroll(driver);
  }

  manifest.completedAt = new Date().toISOString();
  writeJson(manifestPath, manifest);
  const data = getDashboardData();
  const newUsageIds = collectMediaUsageIdsFromTweets(manifest.capturedTweets);
  const assetSync = await syncMediaAssetIndex({
    usages: data.tweetUsages,
    manifests: data.manifests,
    usageIds: newUsageIds
  });
  const summarySync = syncMediaAssetSummaries({
    usages: data.tweetUsages,
    assetIndex: assetSync.index,
    assetIds: assetSync.touchedAssetIds
  });
  await syncFacetSearchAssetIndex({
    summaries: summarySync.file.summaries,
    usages: data.tweetUsages,
    assetIds: summarySync.touchedAssetIds
  });
  if (autoAnalyzeAfterCrawl) {
    console.log("Queueing detached missing-usage analysis after crawl...");
    queueMissingUsageAnalysis("timeline crawl");
  }
  if (autoAnalyzeTopicsAfterCrawl) {
    console.log("Queueing detached topic analysis after crawl...");
    queueTopicAnalysisRefresh("timeline crawl");
  }
  await browser.close();
  console.log(`Wrote manifest -> ${path.relative(projectRoot, manifestPath)}`);
}

run().catch((error: Error) => {
  console.error(error);
  process.exit(1);
});
