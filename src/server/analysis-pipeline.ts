import { buildUsageId } from "@/src/lib/usage-id";
import { analyzeTweetMediaUsage, analyzeTweetMediaUsageWithOptions } from "@/src/server/gemini-analysis";
import { writeUsageAnalysis } from "@/src/server/analysis-store";
import { indexUsageAnalysisInChroma } from "@/src/server/chroma-facets";
import { readMediaAssetIndex, syncMediaAssetSummaries } from "@/src/server/media-assets";
import { getDashboardData } from "@/src/server/data";
import { analyzeMediaAssetVideo, assertVideoWithinAnalysisLimit } from "@/src/server/media-asset-video";
import { findTweetUsage } from "@/src/server/tweet-repository";
import path from "node:path";

export async function analyzeAndIndexTweetUsage(tweetId: string, mediaIndex = 0) {
  const usage = findTweetUsage(tweetId, mediaIndex);
  if (!usage) {
    throw new Error(`Tweet usage not found for tweetId=${tweetId} mediaIndex=${mediaIndex}`);
  }

  const usageId = buildUsageId(usage.tweet, usage.mediaIndex);
  const assetIndex = readMediaAssetIndex();
  const assetId = assetIndex?.usageToAssetId[usageId] ?? null;
  const asset = assetId ? assetIndex?.assets.find((entry) => entry.assetId === assetId) ?? null : null;
  const promotedVideoPath =
    asset?.promotedVideoFilePath && !asset.promotedVideoFilePath.endsWith(".m3u8")
      ? path.join(process.cwd(), asset.promotedVideoFilePath)
      : null;
  const dashboardUsage = getDashboardData().tweetUsages.find((entry) => entry.usageId === usageId) ?? null;

  if (asset && promotedVideoPath) {
    await assertVideoWithinAnalysisLimit(promotedVideoPath, `usage video ${usageId}`);
    await analyzeMediaAssetVideo(asset, dashboardUsage);
  }

  const analysis = promotedVideoPath
    ? await analyzeTweetMediaUsageWithOptions(usage.tweet, {
        mediaIndex: usage.mediaIndex,
        mediaSourceOverride: promotedVideoPath
      })
    : await analyzeTweetMediaUsage(usage.tweet, usage.mediaIndex);
  const filePath = writeUsageAnalysis(analysis);
  const indexResult = await indexUsageAnalysisInChroma(usage.tweet, analysis);
  const dashboardData = getDashboardData();
  const refreshedAssetIndex = readMediaAssetIndex();

  if (refreshedAssetIndex) {
    syncMediaAssetSummaries({
      usages: dashboardData.tweetUsages,
      assetIndex: refreshedAssetIndex,
      assetIds: assetId ? [assetId] : []
    });
  }

  return {
    usageId,
    filePath,
    indexedCount: indexResult.indexedCount,
    analysis
  };
}
