import { resolveMediaDisplayUrl } from "@/src/lib/media-display";
import type { ReplyMediaCandidate } from "@/src/lib/reply-composer";
import type { MemeTemplateRecord } from "@/src/lib/meme-template";
import { readMemeTemplates } from "@/src/server/meme-template-store";

function normalizeToken(token: string): string {
  return token.trim().toLowerCase();
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map(normalizeToken)
    .filter(Boolean);
}

function countOverlap(left: string[], right: string[]): number {
  const rightSet = new Set(right);
  return left.reduce((count, token) => count + (rightSet.has(token) ? 1 : 0), 0);
}

function buildSearchHaystack(record: MemeTemplateRecord): string[] {
  return [
    record.label,
    record.title,
    ...record.alternateNames,
    record.usageSummary,
    record.whyItWorks,
    ...record.commonUseCases,
    ...record.toneTags,
    record.about ?? "",
    record.origin ?? "",
    record.meaning ?? ""
  ].filter(Boolean);
}

function scoreTemplate(record: MemeTemplateRecord, query: string): number {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return 0;
  }

  const fields = buildSearchHaystack(record);
  const fieldTokens = fields.flatMap((field) => tokenize(field));
  const overlap = countOverlap(queryTokens, fieldTokens);
  const normalizedTitle = `${record.label} ${record.title}`.toLowerCase();
  const queryLower = query.trim().toLowerCase();
  const phraseBonus = queryLower && normalizedTitle.includes(queryLower) ? 1.25 : 0;
  const toneBonus = record.toneTags.some((tag) => queryLower.includes(tag.toLowerCase())) ? 0.35 : 0;

  return overlap + phraseBonus + toneBonus;
}

function buildTemplateCandidate(record: MemeTemplateRecord, query: string, score: number): ReplyMediaCandidate | null {
  const localFilePath = record.baseTemplate?.localFilePath ?? record.examples[0]?.localFilePath ?? null;
  if (!localFilePath) {
    return null;
  }

  return {
    candidateId: `meme-template::${record.key}`,
    usageId: null,
    assetId: `meme-template::${record.templateId}`,
    tweetId: null,
    tweetUrl: null,
    authorUsername: null,
    createdAt: record.updatedAt,
    tweetText: record.usageSummary,
    displayUrl: resolveMediaDisplayUrl({
      localFilePath
    }),
    localFilePath,
    videoFilePath: null,
    mediaKind: "image",
    combinedScore: score,
    rankingScore: score,
    assetStarred: false,
    assetUsageCount: null,
    duplicateGroupUsageCount: null,
    hotnessScore: null,
    matchReason: `matched imported meme template for query "${query}"`,
    sourceType: "meme_template",
    sourceLabel: record.title,
    analysis: {
      captionBrief: record.usageSummary,
      sceneDescription: record.about ?? record.meaning ?? record.title,
      primaryEmotion: record.toneTags[0] ?? null,
      conveys: record.commonUseCases[0] ?? record.usageSummary,
      rhetoricalRole: "meme_template",
      culturalReference: record.title,
      analogyTarget: record.commonUseCases[0] ?? null,
      searchKeywords: Array.from(new Set([...record.toneTags, ...record.commonUseCases])).slice(0, 8)
    }
  };
}

export function searchMemeTemplates(queries: string[], limitPerQuery = 4): {
  candidates: ReplyMediaCandidate[];
  queryOutcomes: Array<{ query: string; resultCount: number }>;
} {
  const templates = readMemeTemplates();
  const candidates: ReplyMediaCandidate[] = [];
  const queryOutcomes: Array<{ query: string; resultCount: number }> = [];

  for (const query of queries) {
    const matches = templates
      .map((record) => ({ record, score: scoreTemplate(record, query) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limitPerQuery);

    queryOutcomes.push({
      query,
      resultCount: matches.length
    });

    for (const match of matches) {
      const candidate = buildTemplateCandidate(match.record, query, match.score);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  return { candidates, queryOutcomes };
}
