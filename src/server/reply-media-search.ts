import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMediaDisplayUrl } from "@/src/lib/media-display";
import type { ReplyMediaCandidate } from "@/src/lib/reply-composer";
import type { TweetUsageRecord } from "@/src/lib/types";
import { runCliCommand } from "@/src/server/cli-process";
import { getCurrentComposeRunLog } from "@/src/server/compose-run-log";
import { getLightweightUsageData } from "@/src/server/data";
import { searchMemeTemplates } from "@/src/server/meme-template-search";
import { createPerfTrace } from "@/src/server/perf-log";

interface FacetSearchPayload {
  command: string;
  query: string;
  limit: number;
  result_count: number;
  results: Array<{
    result_id: string;
    matched_facet: {
      name: string | null;
      description: string | null;
      value: unknown;
    };
    scores: {
      combined_score: number;
    };
    usage: {
      usage_id: string | null;
      tweet_id: string | null;
    };
    tweet: {
      tweet_url: string | null;
      author_username: string | null;
      created_at: string | null;
      text: string | null;
    };
    media: {
      source_url: string | null;
      preview_url: string | null;
      poster_url: string | null;
      local_file_path: string | null;
      playable_file_path: string | null;
    };
    analysis: {
      mediaKind?: string | null;
      caption_brief?: string | null;
      scene_description?: string | null;
      primary_emotion?: string | null;
      conveys?: string | null;
      rhetorical_role?: string | null;
      cultural_reference?: string | null;
      analogy_target?: string | null;
      search_keywords?: string[];
    } | null;
    raw_metadata?: {
      media_asset_id?: string | null;
    };
  }>;
}

export interface ReplyMediaSearchProvider {
  providerId: string;
  searchMany(queries: string[], limitPerQuery?: number, maxCandidates?: number): Promise<{
    candidates: ReplyMediaCandidate[];
    warning: string | null;
    queryOutcomes: Array<{
      query: string;
      resultCount: number;
    }>;
  }>;
}

const cliFilePath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(cliFilePath), "..", "..");
const binPath = path.join(repoRoot, "bin", "x-media-analyst.mjs");
const searchTimeoutMs = Number(process.env.REPLY_MEDIA_SEARCH_TIMEOUT_MS || 120_000);
const STARRED_BONUS = 0.35;
const DUPLICATE_GROUP_BONUS = 0.18;
const HOTNESS_BONUS = 0.16;

function extractJsonPayload(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("Search CLI returned empty output");
  }

  if (trimmed.startsWith("{")) {
    return trimmed;
  }

  const objectIndex = trimmed.indexOf("{");
  if (objectIndex === -1) {
    throw new Error(`Search CLI did not return JSON. Output was: ${trimmed.slice(0, 200)}`);
  }

  return trimmed.slice(objectIndex);
}

function parseSearchPayload(stdout: string): FacetSearchPayload {
  return JSON.parse(extractJsonPayload(stdout)) as FacetSearchPayload;
}

function buildCandidate(
  row: FacetSearchPayload["results"][number],
  query: string
): ReplyMediaCandidate | null {
  const usageId = row.usage.usage_id;
  if (!usageId) {
    return null;
  }

  const displayUrl = resolveMediaDisplayUrl({
    localFilePath: row.media.local_file_path,
    posterUrl: row.media.poster_url,
    previewUrl: row.media.preview_url,
    sourceUrl: row.media.source_url
  });

  return {
    candidateId: `${usageId}::${row.raw_metadata?.media_asset_id ?? row.result_id}`,
    usageId,
    assetId: row.raw_metadata?.media_asset_id ?? null,
    tweetId: row.usage.tweet_id,
    tweetUrl: row.tweet.tweet_url,
    authorUsername: row.tweet.author_username,
    createdAt: row.tweet.created_at,
    tweetText: row.tweet.text,
    displayUrl,
    localFilePath: row.media.local_file_path,
    videoFilePath: row.media.playable_file_path,
    mediaKind: row.analysis?.mediaKind ?? null,
    combinedScore: row.scores.combined_score,
    rankingScore: null,
    assetStarred: false,
    assetUsageCount: null,
    duplicateGroupUsageCount: null,
    hotnessScore: null,
    matchReason: row.matched_facet.name
      ? `matched ${row.matched_facet.name} for query "${query}"`
      : `query "${query}"`,
    sourceType: "usage_facet",
    sourceLabel: row.tweet.text,
    analysis: row.analysis
      ? {
          captionBrief: row.analysis.caption_brief ?? null,
          sceneDescription: row.analysis.scene_description ?? null,
          primaryEmotion: row.analysis.primary_emotion ?? null,
          conveys: row.analysis.conveys ?? null,
          rhetoricalRole: row.analysis.rhetorical_role ?? null,
          culturalReference: row.analysis.cultural_reference ?? null,
          analogyTarget: row.analysis.analogy_target ?? null,
          searchKeywords: row.analysis.search_keywords ?? []
        }
      : null
  };
}

function dedupeCandidates(candidates: ReplyMediaCandidate[], maxCandidates: number): ReplyMediaCandidate[] {
  const usageById = getUsageMap();
  const byKey = new Map<string, { candidate: ReplyMediaCandidate; rankingScore: number }>();

  for (const candidate of candidates) {
    const usage = usageById.get(candidate.usageId ?? "");
    const rankingScore = computeCandidateRankingScore(candidate, usage);
    const enrichedCandidate = enrichCandidate(candidate, usage, rankingScore);
    const key = `${enrichedCandidate.sourceType}:${enrichedCandidate.assetId ?? enrichedCandidate.usageId ?? enrichedCandidate.candidateId}`;
    const current = byKey.get(key);
    if (!current || rankingScore > current.rankingScore) {
      byKey.set(key, { candidate: enrichedCandidate, rankingScore });
    }
  }

  return Array.from(byKey.values())
    .sort((left, right) => {
      if (right.rankingScore !== left.rankingScore) {
        return right.rankingScore - left.rankingScore;
      }

      return right.candidate.combinedScore - left.candidate.combinedScore;
    })
    .map((entry) => entry.candidate)
    .slice(0, maxCandidates);
}

function getUsageMap(): Map<string, TweetUsageRecord> {
  try {
    return new Map(getLightweightUsageData().map((usage) => [usage.usageId, usage]));
  } catch {
    return new Map();
  }
}

function computeCandidateRankingScore(candidate: ReplyMediaCandidate, usage: TweetUsageRecord | undefined): number {
  if (!usage) {
    return candidate.combinedScore;
  }

  const starredBoost = usage.mediaAssetStarred ? STARRED_BONUS : 0;
  const duplicateBoost =
    usage.duplicateGroupUsageCount > 1 ? Math.log1p(usage.duplicateGroupUsageCount - 1) * DUPLICATE_GROUP_BONUS : 0;
  const hotnessBoost = Math.log1p(Math.max(0, usage.hotnessScore)) * HOTNESS_BONUS;

  return candidate.combinedScore + starredBoost + duplicateBoost + hotnessBoost;
}

function enrichCandidate(
  candidate: ReplyMediaCandidate,
  usage: TweetUsageRecord | undefined,
  rankingScore: number
): ReplyMediaCandidate {
  return {
    ...candidate,
    rankingScore,
    assetStarred: usage?.mediaAssetStarred ?? false,
    assetUsageCount: usage?.mediaAssetUsageCount ?? null,
    duplicateGroupUsageCount: usage?.duplicateGroupUsageCount ?? null,
    hotnessScore: usage?.hotnessScore ?? null
  };
}

export class CliFacetReplyMediaSearchProvider implements ReplyMediaSearchProvider {
  providerId = "x-media-analyst-search-facets";
  private readonly scope: string;

  constructor(options?: { scope?: string }) {
    this.scope = options?.scope ?? "compose";
  }

  async searchMany(queries: string[], limitPerQuery = 6, maxCandidates = 8): Promise<{
    candidates: ReplyMediaCandidate[];
    warning: string | null;
    queryOutcomes: Array<{
      query: string;
      resultCount: number;
    }>;
  }> {
    const logger = getCurrentComposeRunLog();
    const perf = createPerfTrace("reply-media-search", {
      provider: this.providerId,
      scope: this.scope,
      queryCount: queries.length,
      limitPerQuery,
      maxCandidates
    });
    const startedAt = Date.now();
    const memeTemplateResult = searchMemeTemplates(queries, Math.max(2, Math.min(4, limitPerQuery)));
    perf.mark("meme_templates_ready", {
      candidateCount: memeTemplateResult.candidates.length
    });
    let settled: Array<{ query: string; payload: FacetSearchPayload }> = [];
    let warning: string | null = null;
    let failed = false;

    logger?.appendEvent({
      type: "search_started",
      provider: this.providerId,
      scope: this.scope,
      queries,
      limitPerQuery,
      maxCandidates
    });

    try {
      const searchResults = await Promise.allSettled(
        queries.map(async (query) => {
          const queryPerf = createPerfTrace("reply-media-search.query", {
            provider: this.providerId,
            scope: this.scope,
            query,
            limitPerQuery
          });
          const queryStartedAt = Date.now();
          try {
            const result = await runCliCommand({
              command: process.execPath,
              args: [binPath, "search", "facets", "--query", query, "--limit", String(limitPerQuery), "--format", "json"],
              cwd: repoRoot,
              env: {
                ...process.env,
                X_TREND_PROJECT_ROOT: repoRoot
              },
              timeoutMs: searchTimeoutMs
            });

            if (result.exitCode !== 0) {
              throw new Error(result.stderr.trim() || `Search CLI exited with code ${result.exitCode}`);
            }

            const payload = parseSearchPayload(result.stdout);
            queryPerf.end({
              resultCount: payload.result_count
            });
            logger?.writeJsonArtifact(`search-${this.scope}-${query}`, {
              query,
              stdout: result.stdout,
              stderr: result.stderr,
              durationMs: Date.now() - queryStartedAt,
              payload
            });
            return { query, payload };
          } catch (error) {
            queryPerf.fail(error);
            throw error;
          }
        })
      );
      const failedQueries: string[] = [];
      settled = searchResults.flatMap((result, index) => {
        if (result.status === "fulfilled") {
          return [result.value];
        }

        perf.mark("query_failed", {
          query: queries[index] ?? `query-${index + 1}`
        });
        failedQueries.push(queries[index] ?? `query-${index + 1}`);
        return [];
      });

      if (failedQueries.length > 0) {
        const reason = searchResults.find((result): result is PromiseRejectedResult => result.status === "rejected")?.reason;
        const reasonMessage = reason instanceof Error ? reason.message : String(reason);
        warning = `Media search timed out or failed for ${failedQueries.join(", ")}. ${reasonMessage}`;
      }
    } catch (error) {
      warning = error instanceof Error ? error.message : String(error);
      failed = true;
      perf.fail(error);
      logger?.recordError(`search-${this.scope}`, error, {
        provider: this.providerId,
        scope: this.scope,
        queries
      });
    }

    if (warning) {
      logger?.recordError(`search-${this.scope}`, warning, {
        provider: this.providerId,
        scope: this.scope,
        queries
      });
    }

    const candidates = dedupeCandidates([
      ...settled.flatMap(({ query, payload }) =>
        payload.results.map((row) => buildCandidate(row, query)).filter((value): value is ReplyMediaCandidate => Boolean(value))
      ),
      ...memeTemplateResult.candidates
    ], maxCandidates);
    perf.mark("candidates_ranked", {
      settledQueryCount: settled.length,
      candidateCount: candidates.length,
      warning: warning ?? null
    });
    const queryOutcomes = queries.map((query) => {
      const payload = settled.find((item) => item.query === query)?.payload ?? null;
      const memeTemplateCount = memeTemplateResult.queryOutcomes.find((item) => item.query === query)?.resultCount ?? 0;
      return {
        query,
        resultCount: (payload?.result_count ?? 0) + memeTemplateCount
      };
    });

    logger?.writeJsonArtifact(`search-${this.scope}-summary`, {
      provider: this.providerId,
      scope: this.scope,
      queries,
      limitPerQuery,
      maxCandidates,
      warning,
      queryOutcomes,
      memeTemplateCandidates: memeTemplateResult.candidates,
      candidates
    });
    logger?.appendEvent({
      type: "search_completed",
      provider: this.providerId,
      scope: this.scope,
      warning,
      candidateCount: candidates.length,
      durationMs: Date.now() - startedAt
    });
    if (!failed) {
      perf.end({
        candidateCount: candidates.length,
        warning: warning ?? null
      });
    }

    return {
      candidates,
      warning,
      queryOutcomes
    };
  }
}
