import { ANALYSIS_FACET_NAMES, type AnalysisFacetName } from "@/src/lib/analysis-schema";
import { getUsageDetailData } from "@/src/server/data";
import { searchTopicIndex, type TopicSearchRow } from "@/src/server/chroma-facets";
import { getMediaAssetView } from "@/src/server/media-assets";
import type { MediaAssetView, TweetUsageRecord } from "@/src/lib/types";

function buildRelevantTopicQuery(
  usage: TweetUsageRecord
): string | null {
  const parts = new Set<string>();
  const analysis = usage.analysis;

  if (usage.tweet.text?.trim()) {
    parts.add(usage.tweet.text.trim());
  }

  const stringFacets: Array<keyof typeof analysis> = [
    "conveys",
    "user_intent",
    "rhetorical_role",
    "text_media_relationship",
    "primary_emotion",
    "emotional_tone",
    "reference_entity",
    "reference_source",
    "cultural_reference",
    "analogy_target",
    "trend_signal",
    "audience_takeaway"
  ];

  for (const key of stringFacets) {
    const value = analysis[key];
    if (typeof value === "string" && value.trim()) {
      parts.add(value.trim());
    }
  }

  for (const value of analysis.brand_signals) {
    if (value.trim()) {
      parts.add(value.trim());
    }
  }

  for (const value of analysis.search_keywords) {
    if (value.trim()) {
      parts.add(value.trim());
    }
  }

  const query = Array.from(parts).join(" ");
  return query.trim() ? query : null;
}

function dedupeRelevantTopics(rows: TopicSearchRow[], tweetId: string | null): TopicSearchRow[] {
  const bestByTopic = new Map<string, TopicSearchRow>();

  for (const row of rows) {
    const key = (row.topic.topicId ?? row.analysis.summaryLabel ?? row.id).toLowerCase();
    const existing = bestByTopic.get(key);
    if (row.tweet.tweetId === tweetId && existing && existing.tweet.tweetId !== tweetId) {
      continue;
    }

    if (!existing || row.combinedScore > existing.combinedScore) {
      bestByTopic.set(key, row);
    }
  }

  return Array.from(bestByTopic.values())
    .sort((left, right) => right.combinedScore - left.combinedScore)
    .slice(0, 6);
}

export async function getUsageDetail(usageId: string): Promise<(TweetUsageRecord & {
  mediaAssetView: MediaAssetView | null;
  orderedFacets: Array<{ name: string; value: TweetUsageRecord["analysis"][AnalysisFacetName] }>;
  relevantTopics: TopicSearchRow[];
}) | null> {
  const data = getUsageDetailData(usageId);
  const match = data.usage;

  if (!match) {
    return null;
  }

  const orderedFacets = ANALYSIS_FACET_NAMES.map((name) => ({
    name,
    value: match.analysis[name as AnalysisFacetName]
  }));
  const relevantTopicQuery = buildRelevantTopicQuery(match);
  const relevantTopics = relevantTopicQuery
    ? dedupeRelevantTopics((await searchTopicIndex({ query: relevantTopicQuery, limit: 12 })).results, match.tweet.tweetId)
    : [];

  return {
    ...match,
    mediaAssetView: getMediaAssetView({
      usageId,
      usages: data.usages
    }),
    orderedFacets,
    relevantTopics
  };
}
