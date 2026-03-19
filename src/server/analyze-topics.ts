import { setTimeout as delay } from "node:timers/promises";
import { getDashboardData } from "@/src/server/data";
import { indexTopicAnalysisInChroma } from "@/src/server/chroma-facets";
import { analyzeTweetTopicsWithGemini } from "@/src/server/gemini-topic-analysis";
import { listPriorityAccountUsernames } from "@/src/server/priority-accounts";
import { buildTopicAnalysisId, readAllTopicAnalyses, writeTopicAnalysis } from "@/src/server/topic-analysis-store";
import { buildTopicIndex, writeTopicIndex } from "@/src/server/tweet-topics";

const topicInterItemDelayMs = Number(process.env.ANALYZE_TOPICS_DELAY_MS || 800);
const defaultTopicBatchLimit = Number(process.env.ANALYZE_TOPICS_DEFAULT_LIMIT || 100);

function buildTweetKey(tweet: { sourceName: string; authorUsername: string | null; text: string | null; tweetId: string | null }): string {
  return tweet.tweetId ?? `${tweet.sourceName}:${tweet.authorUsername ?? "unknown"}:${tweet.text ?? ""}`;
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

export interface AnalyzeTopicsResult {
  completed: number;
  skipped: number;
  failed: number;
  totalQueued: number;
  topicCount: number;
}

export async function analyzeTopics(input: {
  limit?: number;
  force?: boolean;
} = {}): Promise<AnalyzeTopicsResult> {
  const startedAt = Date.now();
  const data = getDashboardData();
  const existingByTweetKey = new Map(readAllTopicAnalyses().map((analysis) => [analysis.tweetKey, analysis]));
  const usagesByTweetKey = new Map<string, typeof data.tweetUsages>();
  for (const usage of data.tweetUsages) {
    const tweetKey = buildTweetKey(usage.tweet);
    const existing = usagesByTweetKey.get(tweetKey);
    if (existing) {
      existing.push(usage);
    } else {
      usagesByTweetKey.set(tweetKey, [usage]);
    }
  }
  const queued = data.capturedTweets
    .map((entry) => ({
      tweet: entry.tweet,
      usages: usagesByTweetKey.get(entry.tweetKey) ?? [],
      tweetKey: entry.tweetKey
    }))
    .filter((entry) => input.force || !existingByTweetKey.has(entry.tweetKey))
    .slice(0, input.limit ?? defaultTopicBatchLimit);

  console.log(`Found ${queued.length} tweets queued for topic analysis. interItemDelay=${topicInterItemDelayMs}ms`);

  let completed = 0;
  let skipped = 0;
  let failed = 0;

  for (const [index, entry] of queued.entries()) {
    const itemStartedAt = Date.now();
    const analysisId = buildTopicAnalysisId(entry.tweet);
    console.log(
      `Analyzing topics for ${analysisId}... item=${index + 1}/${queued.length} completed=${completed} failed=${failed} skipped=${skipped} elapsed=${formatDuration(itemStartedAt - startedAt)}`
    );

    try {
      const analysis = await analyzeTweetTopicsWithGemini({
        tweet: entry.tweet,
        usages: entry.usages,
        analysisId
      });
      writeTopicAnalysis(analysis);
      await indexTopicAnalysisInChroma(analysis, entry.usages);
      completed += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Topic analysis failed for ${analysisId}: ${message}`);
    }

    if (topicInterItemDelayMs > 0 && index < queued.length - 1) {
      await delay(topicInterItemDelayMs);
    }
  }

  const allAnalyses = readAllTopicAnalyses();
  const priorityAuthorUsernames = listPriorityAccountUsernames();
  const topicIndex = buildTopicIndex({
    tweets: data.capturedTweets.map((entry) => entry.tweet),
    usages: data.tweetUsages,
    topicAnalyses: allAnalyses,
    priorityAuthorUsernames
  });
  writeTopicIndex(topicIndex);

  console.log(
    `Topic analysis finished in ${formatDuration(Date.now() - startedAt)}. completed=${completed} failed=${failed} skipped=${skipped} totalQueued=${queued.length} topics=${topicIndex.topicCount}`
  );

  return {
    completed,
    skipped,
    failed,
    totalQueued: queued.length,
    topicCount: topicIndex.topicCount
  };
}
