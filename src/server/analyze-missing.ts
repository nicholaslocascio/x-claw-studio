import { setTimeout as delay } from "node:timers/promises";
import { getDashboardData } from "@/src/server/data";
import { analyzeAndIndexTweetUsage } from "@/src/server/analysis-pipeline";

const analysisInterItemDelayMs = Number(process.env.ANALYZE_MISSING_DELAY_MS || 2500);

export interface AnalyzeMissingResult {
  completed: number;
  skipped: number;
  failed: number;
  totalMissing: number;
}

function getUsageTimestampMs(input: { tweet: { createdAt?: string | null; extraction?: { extractedAt?: string | null } } }): number {
  const timestamp = input.tweet.createdAt ?? input.tweet.extraction?.extractedAt ?? null;
  const parsed = timestamp ? Date.parse(timestamp) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
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

export async function analyzeMissingUsages(): Promise<AnalyzeMissingResult> {
  const startedAt = Date.now();
  const data = getDashboardData();
  const missing = data.tweetUsages
    .filter((usage) => usage.analysis.status !== "complete" && usage.tweet.tweetId)
    .sort((left, right) => {
      const rightTimestamp = getUsageTimestampMs(right);
      const leftTimestamp = getUsageTimestampMs(left);

      if (rightTimestamp !== leftTimestamp) {
        return rightTimestamp - leftTimestamp;
      }

      return left.usageId.localeCompare(right.usageId);
    });

  console.log(
    `Found ${missing.length} usages missing analysis. interItemDelay=${analysisInterItemDelayMs}ms`
  );

  let completed = 0;
  let skipped = 0;
  let failed = 0;

  for (const [index, usage] of missing.entries()) {
    if (!usage.tweet.tweetId) {
      skipped += 1;
      continue;
    }

    const itemStartedAt = Date.now();
    console.log(
      `Analyzing ${usage.usageId}... item=${index + 1}/${missing.length} completed=${completed} failed=${failed} skipped=${skipped} elapsed=${formatDuration(itemStartedAt - startedAt)}`
    );
    try {
      await analyzeAndIndexTweetUsage(usage.tweet.tweetId, usage.mediaIndex);
      completed += 1;
      const elapsedMs = Date.now() - itemStartedAt;
      const processed = completed + failed + skipped;
      const averageMs = processed > 0 ? (Date.now() - startedAt) / processed : 0;
      const remaining = Math.max(0, missing.length - processed);
      const etaMs = averageMs * remaining;
      console.log(
        `Analysis complete for ${usage.usageId}. item=${index + 1}/${missing.length} duration=${formatDuration(elapsedMs)} completed=${completed} failed=${failed} skipped=${skipped} eta=${formatDuration(etaMs)}`
      );
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      const elapsedMs = Date.now() - itemStartedAt;
      console.error(
        `Analysis failed for ${usage.usageId}. item=${index + 1}/${missing.length} duration=${formatDuration(elapsedMs)} completed=${completed} failed=${failed} skipped=${skipped} error=${message}`
      );
    }

    if (analysisInterItemDelayMs > 0 && index < missing.length - 1) {
      console.log(
        `Waiting ${analysisInterItemDelayMs}ms before next analysis item... nextItem=${index + 2}/${missing.length}`
      );
      await delay(analysisInterItemDelayMs);
    }
  }

  console.log(
    `Analysis sweep finished in ${formatDuration(Date.now() - startedAt)}. completed=${completed} failed=${failed} skipped=${skipped} totalMissing=${missing.length}`
  );

  return {
    completed,
    skipped,
    failed,
    totalMissing: missing.length
  };
}
