import { setTimeout as delay } from "node:timers/promises";
import {
  ChromaClient,
  registerEmbeddingFunction,
  type EmbeddingFunction,
  type Metadata,
  type Where
} from "chromadb";
import { GoogleGenAI } from "@google/genai";
import {
  ANALYSIS_FACET_DESCRIPTIONS,
  ANALYSIS_FACET_NAMES,
  type AnalysisFacetName
} from "@/src/lib/analysis-schema";
import { getGeminiApiKey, loadEnv } from "@/src/lib/env";
import { readAllTopicAnalyses } from "@/src/server/topic-analysis-store";
import { getDashboardData, getLightweightUsageData, getReadModelCacheKey } from "@/src/server/data";
import { readMediaAssetIndex, readMediaAssetSummaries } from "@/src/server/media-assets";
import { createPerfTrace } from "@/src/server/perf-log";
import type {
  ExtractedTweet,
  MediaAssetRecord,
  MediaAssetSummary,
  TopicClusterRecord,
  TweetTopicAnalysisRecord,
  TweetUsageRecord,
  UsageAnalysis
} from "@/src/lib/types";

loadEnv();
const chromaUrl = process.env.CHROMA_URL || "http://localhost:8000";
const chromaCollectionName = process.env.CHROMA_COLLECTION || "twitter_trend_facets";
const embeddingModel = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
const chromaEmbeddingMaxRetries = Number(process.env.GEMINI_EMBEDDING_MAX_RETRIES || 4);
const chromaEmbeddingRetryBaseDelayMs = Number(process.env.GEMINI_EMBEDDING_RETRY_BASE_DELAY_MS || 5000);
const chromaEmbeddingRetryMaxDelayMs = Number(process.env.GEMINI_EMBEDDING_RETRY_MAX_DELAY_MS || 45000);
const geminiEmbedBatchLimit = 100;
const hybridVectorWeight = Number(process.env.HYBRID_SEARCH_VECTOR_WEIGHT || 0.65);
const hybridLexicalWeight = Number(process.env.HYBRID_SEARCH_LEXICAL_WEIGHT || 0.35);
const hybridPureVectorWeight = Number(process.env.HYBRID_SEARCH_PURE_VECTOR_WEIGHT || 0.28);
const assetSearchScope = "asset_summary";
const assetSearchAllVariant = "all";
let hasWarnedChromaEmbeddingMismatch = false;
let hasRegisteredGeminiEmbeddingFunction = false;
let hasWarnedChromaCollectionRepair = false;
let chromaCollectionRepairPromise: Promise<void> | null = null;
let chromaCollectionPromise: ReturnType<typeof createManagedCollection> | null = null;
const queryEmbeddingCache = new Map<string, number[]>();
const MAX_QUERY_EMBEDDING_CACHE_SIZE = Number(process.env.CHROMA_QUERY_EMBEDDING_CACHE_SIZE || 100);
let assetSearchCorpusCache:
  | {
      key: string;
      corporaByFacet: Map<string, Array<{
        id: string;
        document: string;
        metadata: Record<string, string | number | boolean | null>;
        media: HybridSearchRow["media"];
        tokens: string[];
      }>>;
    }
  | null = null;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function isChromaDefaultEmbeddingMismatch(error: unknown): boolean {
  const message = getErrorMessage(error);
  return (
    message.includes("DefaultEmbeddingFunction") ||
    message.includes("@chroma-core/default-embed") ||
    message.includes("default-embed embedding function")
  );
}

function isChromaCollectionConfigMismatch(error: unknown): boolean {
  const message = getErrorMessage(error);
  return (
    message.includes("configuration.embedding_function") &&
    message.includes("missing field `name`")
  );
}

function isRetryableGeminiError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return (
    message.includes('"status":"INTERNAL"') ||
    message.includes('"code":500') ||
    message.includes("500") ||
    message.includes("Internal error encountered") ||
    message.includes('"status":"UNAVAILABLE"') ||
    message.includes('"code":503') ||
    message.includes("503") ||
    message.includes("high demand") ||
    message.includes("rate limit") ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("429") ||
    message.includes("temporarily unavailable")
  );
}

function computeRetryDelayMs(attempt: number): number {
  const backoff = Math.min(
    chromaEmbeddingRetryMaxDelayMs,
    chromaEmbeddingRetryBaseDelayMs * Math.max(1, 2 ** Math.max(0, attempt - 1))
  );
  const jitter = Math.round(backoff * (0.2 + Math.random() * 0.3));
  return Math.min(chromaEmbeddingRetryMaxDelayMs, backoff + jitter);
}

function warnChromaIndexingSkipped(error: unknown): void {
  if (hasWarnedChromaEmbeddingMismatch) {
    return;
  }

  hasWarnedChromaEmbeddingMismatch = true;
  console.warn(
    `Skipping Chroma indexing because the collection expects Chroma's default embedding package, which is not installed. Scraping and analysis will continue, but vector indexing/search will be unavailable until the collection is recreated or @chroma-core/default-embed is installed. ${getErrorMessage(error)}`
  );
}

function warnChromaCollectionRepair(error: unknown): void {
  if (hasWarnedChromaCollectionRepair) {
    return;
  }

  hasWarnedChromaCollectionRepair = true;
  console.warn(
    `Resetting the Chroma collection because its saved embedding function config is incompatible with the current JS client. The collection is derived from local artifacts and will be rebuilt automatically. ${getErrorMessage(error)}`
  );
}

function facetValueToText(value: UsageAnalysis[AnalysisFacetName]): string | null {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : null;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return value;
}

function buildFacetLexicalPhrases(
  analysis: UsageAnalysis,
  facetName: AnalysisFacetName
): string[] {
  const rawValue = analysis[facetName];

  switch (facetName) {
    case "features_female":
      return rawValue === true ? ["female", "woman", "women", "girl", "female subject"] : [];
    case "features_male":
      return rawValue === true ? ["male", "man", "men", "boy", "male subject"] : [];
    case "has_human_face":
      return rawValue === true ? ["face", "person", "portrait", "human face"] : [];
    case "has_celebrity":
      return rawValue === true ? ["celebrity", "famous person", "public figure", "actor", "actress", "well-known person"] : [];
    default:
      return [];
  }
}

function describeBooleanFacetValue(
  facetName: AnalysisFacetName,
  value: boolean
): string | null {
  if (!value) {
    return null;
  }

  switch (facetName) {
    case "features_female":
      return "female-present person is visible";
    case "features_male":
      return "male-present person is visible";
    case "has_human_face":
      return "human face is clearly visible";
    case "has_celebrity":
      return "celebrity or notable public figure is visible";
    case "has_screenshot_ui":
      return "screen, software interface, or app UI is visible";
    case "has_text_overlay":
      return "text overlay is visible in the media";
    case "has_chart_or_graph":
      return "chart, graph, or plotted data is visible";
    case "has_logo_or_watermark":
      return "logo or watermark is visible";
    default:
      return value ? "present" : null;
  }
}

function facetValueToSearchText(
  analysis: UsageAnalysis,
  facetName: AnalysisFacetName
): string | null {
  const value = analysis[facetName];

  if (typeof value === "boolean") {
    return describeBooleanFacetValue(facetName, value);
  }

  return facetValueToText(value);
}

function formatSemanticList(values: string[]): string | null {
  const cleaned = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  if (cleaned.length === 0) {
    return null;
  }

  if (cleaned.length === 1) {
    return cleaned[0] ?? null;
  }

  if (cleaned.length === 2) {
    return `${cleaned[0]} and ${cleaned[1]}`;
  }

  return `${cleaned.slice(0, -1).join(", ")}, and ${cleaned.at(-1)}`;
}

function buildSemanticSearchSummary(
  analysis: UsageAnalysis,
  context?: FacetSearchContext
): string | null {
  const clauses: string[] = [];
  const visualSignals: string[] = [];
  const subjectSignals: string[] = [];

  if (analysis.features_female) {
    visualSignals.push("female-present people");
  }

  if (analysis.features_male) {
    visualSignals.push("male-present people");
  }

  if (analysis.has_human_face) {
    visualSignals.push("clear human faces");
  }

  if (analysis.has_screenshot_ui) {
    visualSignals.push("software or app interface");
  }

  if (analysis.has_chart_or_graph) {
    visualSignals.push("charts or graphs");
  }

  if (analysis.has_text_overlay) {
    visualSignals.push("embedded text");
  }

  if (analysis.has_logo_or_watermark) {
    visualSignals.push("a visible logo or watermark");
  }

  const primarySubjects = formatSemanticList(analysis.primary_subjects);
  if (primarySubjects) {
    subjectSignals.push(primarySubjects);
  }

  if (analysis.reference_entity) {
    subjectSignals.push(analysis.reference_entity);
  }

  if (analysis.reference_source) {
    subjectSignals.push(analysis.reference_source);
  }

  const visualSummary = formatSemanticList(visualSignals);
  if (visualSummary) {
    clauses.push(`The media shows ${visualSummary}.`);
  }

  const subjectSummary = formatSemanticList(subjectSignals);
  if (subjectSummary) {
    clauses.push(`Key subjects or references include ${subjectSummary}.`);
  }

  if (analysis.setting_context) {
    clauses.push(`The setting is ${analysis.setting_context}.`);
  }

  if (analysis.action_or_event) {
    clauses.push(`The main action is ${analysis.action_or_event}.`);
  }

  if (analysis.conveys) {
    clauses.push(`It conveys ${analysis.conveys}.`);
  }

  if (analysis.user_intent) {
    clauses.push(`The likely posting intent is ${analysis.user_intent}.`);
  }

  if (analysis.meme_format) {
    clauses.push(`The reusable format is ${analysis.meme_format}.`);
  }

  if (analysis.search_keywords.length > 0) {
    const keywordSummary = formatSemanticList(analysis.search_keywords.slice(0, 8));
    if (keywordSummary) {
      clauses.push(`Useful search concepts: ${keywordSummary}.`);
    }
  }

  const archetypeSummary = formatSemanticList(deriveSearchArchetypes(analysis));
  if (archetypeSummary) {
    clauses.push(`Reusable search archetypes: ${archetypeSummary}.`);
  }

  if (context?.tweetText) {
    clauses.push(`Source tweet text: ${context.tweetText}.`);
  }

  return clauses.length > 0 ? clauses.join(" ") : null;
}

function deriveSearchArchetypes(analysis: UsageAnalysis): string[] {
  const archetypes = new Set<string>();
  const textCorpus = [
    analysis.caption_brief,
    analysis.scene_description,
    analysis.ocr_text,
    analysis.setting_context,
    analysis.action_or_event,
    analysis.meme_format,
    analysis.rhetorical_role,
    analysis.reference_source,
    analysis.reference_entity,
    analysis.conveys,
    analysis.user_intent,
    analysis.text_media_relationship,
    ...analysis.primary_subjects,
    ...analysis.secondary_subjects,
    ...analysis.visible_objects,
    ...analysis.search_keywords
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  const hasTerminalSignal =
    /\bterminal\b|\bcli\b|\bconsole\b|\bshell\b|\bcommand line\b|\bgit\b|\bcurl\b/.test(textCorpus);
  const hasDashboardSignal =
    /\bdashboard\b|\bportfolio\b|\banalytics\b|\bmetrics\b|\bwidget\b|\bscoreboard\b/.test(textCorpus);
  const hasUiSignal =
    /\bui\b|\binterface\b|\bapp\b|\bsoftware\b|\bworkspace\b|\bfigma\b|\bweb interface\b/.test(textCorpus);
  const hasReactionSignal =
    /\breaction\b|\breact\b|\bmeme\b|\bresponse\b|\breply\b|\bblank stare\b|\bunbothered\b/.test(textCorpus);

  if (hasReactionSignal || /reaction/i.test(analysis.meme_format ?? "") || /reaction/i.test(analysis.rhetorical_role ?? "")) {
    archetypes.add("reaction image");
    if (analysis.mediaKind.startsWith("video")) {
      archetypes.add("reaction clip");
    }
  }

  if (analysis.has_screenshot_ui) {
    archetypes.add("software screenshot");
    archetypes.add("product UI");
    archetypes.add("app interface");
  }

  if (hasTerminalSignal) {
    archetypes.add("terminal screenshot");
    archetypes.add("developer tools screenshot");
  }

  if (hasDashboardSignal) {
    archetypes.add("dashboard screenshot");
  }

  if (analysis.has_chart_or_graph) {
    archetypes.add("chart screenshot");
    archetypes.add("graph screenshot");
  }

  if (hasUiSignal && analysis.has_screenshot_ui) {
    archetypes.add("product demo");
  }

  return Array.from(archetypes);
}

function buildVectorQueryTexts(input: {
  query: string;
  facetName: AnalysisFacetName | null;
  allFacetsMode: "facet_concat" | "combined_blob";
}): string[] {
  const baseQuery = input.query.trim();
  if (!baseQuery) {
    return [];
  }

  const contextualQuery = input.facetName
    ? `Find saved media where the ${input.facetName} attribute matches this request: ${baseQuery}`
    : input.allFacetsMode === "facet_concat"
      ? `Find saved media assets whose visual or semantic attributes best match this request: ${baseQuery}`
      : `Find saved image or video assets that best match this media search request: ${baseQuery}`;

  return Array.from(new Set([baseQuery, contextualQuery]));
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
  const embeddings: number[][] = [];

  for (let offset = 0; offset < texts.length; offset += geminiEmbedBatchLimit) {
    const batch = texts.slice(offset, offset + geminiEmbedBatchLimit);

    for (let attempt = 1; attempt <= chromaEmbeddingMaxRetries + 1; attempt += 1) {
      try {
        const response = await ai.models.embedContent({
          model: embeddingModel,
          contents: batch
        });
        const batchEmbeddings = (response.embeddings ?? [])
          .map((item) => item.values ?? [])
          .filter((embedding): embedding is number[] => embedding.length > 0);

        if (batchEmbeddings.length !== batch.length) {
          throw new Error(
            `Gemini returned ${batchEmbeddings.length} embeddings for a batch of ${batch.length} documents.`
          );
        }

        embeddings.push(...batchEmbeddings);
        break;
      } catch (error) {
        if (!isRetryableGeminiError(error) || attempt > chromaEmbeddingMaxRetries) {
          throw error;
        }

        const retryDelayMs = computeRetryDelayMs(attempt);
        console.warn(
          `Gemini embedding transient failure for Chroma indexing on attempt ${attempt}/${chromaEmbeddingMaxRetries + 1}. Retrying in ${retryDelayMs}ms. ${getErrorMessage(error)}`
        );
        await delay(retryDelayMs);
      }
    }
  }

  return embeddings;
}

async function embedQueryText(text: string): Promise<number[]> {
  const cacheKey = `${embeddingModel}::${text}`;
  const cached = queryEmbeddingCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const [embedding] = await embedTexts([text]);
  if (!embedding) {
    throw new Error("Gemini did not return an embedding for the search query.");
  }

  queryEmbeddingCache.set(cacheKey, embedding);
  if (queryEmbeddingCache.size > MAX_QUERY_EMBEDDING_CACHE_SIZE) {
    const oldestKey = queryEmbeddingCache.keys().next().value;
    if (oldestKey) {
      queryEmbeddingCache.delete(oldestKey);
    }
  }

  return embedding;
}

class GeminiChromaEmbeddingFunction implements EmbeddingFunction {
  name = "gemini-embedding";

  defaultSpace(): "cosine" {
    return "cosine";
  }

  supportedSpaces(): Array<"cosine"> {
    return ["cosine"];
  }

  getConfig(): Record<string, string> {
    return { model: embeddingModel };
  }

  async generate(texts: string[]): Promise<number[][]> {
    return embedTexts(texts);
  }

  async generateForQueries(texts: string[]): Promise<number[][]> {
    return embedTexts(texts);
  }

  static buildFromConfig(config: Record<string, unknown>): GeminiChromaEmbeddingFunction {
    return new GeminiChromaEmbeddingFunction();
  }
}

function ensureGeminiEmbeddingFunctionRegistered(): void {
  if (hasRegisteredGeminiEmbeddingFunction) {
    return;
  }

  try {
    registerEmbeddingFunction("gemini-embedding", GeminiChromaEmbeddingFunction);
  } catch (error) {
    const message = getErrorMessage(error);
    if (!message.includes("already registered")) {
      throw error;
    }
  }

  try {
    registerEmbeddingFunction("default-embed", GeminiChromaEmbeddingFunction);
  } catch (error) {
    const message = getErrorMessage(error);
    if (!message.includes("already registered")) {
      throw error;
    }
  }

  hasRegisteredGeminiEmbeddingFunction = true;
}

function createChromaClient(): ChromaClient {
  const parsedUrl = new URL(chromaUrl);
  return new ChromaClient({
    ssl: parsedUrl.protocol === "https:",
    host: parsedUrl.hostname,
    port: parsedUrl.port ? Number(parsedUrl.port) : parsedUrl.protocol === "https:" ? 443 : 80
  });
}

async function createManagedCollection(client: ChromaClient) {
  return client.getOrCreateCollection({
    name: chromaCollectionName,
    metadata: { domain: "twitter_trend_facets" },
    embeddingFunction: new GeminiChromaEmbeddingFunction()
  });
}

async function rebuildChromaCollection(): Promise<void> {
  const data = getDashboardData();
  const topicAnalyses = readAllTopicAnalyses();
  const topicUsagesById = new Map(data.tweetUsages.map((usage) => [usage.usageId, usage]));
  const summaryFile = readMediaAssetSummaries();

  if (summaryFile) {
    await indexAssetSearchDocuments({
      summaries: summaryFile.summaries,
      usages: data.tweetUsages
    });
  }

  for (const analysis of topicAnalyses) {
    const usages = analysis.usageIds
      .map((usageId) => topicUsagesById.get(usageId))
      .filter((usage): usage is TweetUsageRecord => Boolean(usage));
    await indexTopicAnalysisInChroma(analysis, usages);
  }
}

async function repairChromaCollection(client: ChromaClient, error: unknown): Promise<void> {
  warnChromaCollectionRepair(error);
  chromaCollectionPromise = null;

  if (!chromaCollectionRepairPromise) {
    chromaCollectionRepairPromise = (async () => {
      try {
        await client.deleteCollection({ name: chromaCollectionName });
      } catch {}

      await createManagedCollection(client);
      await rebuildChromaCollection();
    })().finally(() => {
      chromaCollectionRepairPromise = null;
    });
  }

  await chromaCollectionRepairPromise;
}

async function getCollection() {
  ensureGeminiEmbeddingFunctionRegistered();
  if (chromaCollectionPromise) {
    return chromaCollectionPromise;
  }

  const client = createChromaClient();
  chromaCollectionPromise = (async () => {
    try {
      return await createManagedCollection(client);
    } catch (error) {
      if (!isChromaCollectionConfigMismatch(error)) {
        throw error;
      }

      await repairChromaCollection(client, error);
      return createManagedCollection(client);
    }
  })().catch((error) => {
    chromaCollectionPromise = null;
    throw error;
  });

  return chromaCollectionPromise;
}

async function upsertWithExplicitEmbeddings(input: {
  ids: string[];
  documents: string[];
  metadatas: Metadata[];
  embeddings: number[][];
}): Promise<{ indexedCount: number }> {
  try {
    const collection = await getCollection();
    await collection.upsert(input);
    return { indexedCount: input.ids.length };
  } catch (error) {
    if (isChromaDefaultEmbeddingMismatch(error)) {
      warnChromaIndexingSkipped(error);
      return { indexedCount: 0 };
    }

    throw error;
  }
}

async function deleteDocumentIds(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  try {
    const collection = await getCollection();
    await collection.delete({ ids });
  } catch (error) {
    if (isChromaDefaultEmbeddingMismatch(error)) {
      warnChromaIndexingSkipped(error);
      return;
    }

    throw error;
  }
}

export interface HybridSearchRow {
  id: string;
  document: string;
  metadata: Metadata;
  media: {
    mediaAssetId: string | null;
    mediaLocalFilePath: string | null;
    mediaPlayableFilePath: string | null;
    sourceUrl: string | null;
    previewUrl: string | null;
    posterUrl: string | null;
    tweetUrl: string | null;
    tweetText: string | null;
    authorHandle: string | null;
    authorUsername: string | null;
    authorDisplayName: string | null;
    createdAt: string | null;
    mediaIndex: number;
    duplicateGroupId: string | null;
    duplicateGroupUsageCount: number;
    hotnessScore: number;
    mediaAssetStarred: boolean;
    mediaAssetUsageCount: number;
    phashMatchCount: number;
  } | null;
  vectorDistance: number | null;
  vectorScore: number;
  lexicalScore: number;
  combinedScore: number;
  matchedBy: Array<"vector" | "lexical">;
}

export interface HybridSearchResult {
  query: string;
  facetName: AnalysisFacetName | null;
  limit: number;
  vectorStatus: "ok" | "unavailable";
  warningMessage: string | null;
  filters: {
    mediaKinds: string[] | null;
    highQualityOnly: boolean;
    allFacetsMode: "facet_concat" | "combined_blob";
    hardMatchMode: "off" | "intent";
  };
  results: HybridSearchRow[];
}

function normalizeMediaKindFilter(value: string): string {
  return value.trim().toLowerCase();
}

function rowMatchesMediaKinds(row: HybridSearchRow, mediaKinds: string[] | null): boolean {
  if (!mediaKinds || mediaKinds.length === 0) {
    return true;
  }

  const rowMediaKind =
    (row.media?.mediaPlayableFilePath ? "video" : null) ??
    (typeof row.metadata.media_kind === "string" ? String(row.metadata.media_kind).toLowerCase() : null);

  return rowMediaKind ? mediaKinds.includes(rowMediaKind) : false;
}

function rowMatchesHighQualityFilter(row: HybridSearchRow): boolean {
  const starred = row.media?.mediaAssetStarred ?? false;
  const duplicateGroupUsageCount = row.media?.duplicateGroupUsageCount ?? 0;
  const assetUsageCount = row.media?.mediaAssetUsageCount ?? 0;
  const phashMatchCount = row.media?.phashMatchCount ?? 0;

  return starred || duplicateGroupUsageCount > 1 || assetUsageCount > 1 || phashMatchCount > 0;
}

function getFacetSearchCandidateLimit(limit: number, highQualityOnly: boolean): number {
  if (!highQualityOnly) {
    return limit;
  }

  return Math.max(limit * 4, 60);
}

function resolveIntentFacetName(query: string): AnalysisFacetName | null {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, " ");

  switch (normalized) {
    case "female":
    case "woman":
    case "women":
    case "girl":
      return "features_female";
    case "male":
    case "man":
    case "men":
    case "boy":
      return "features_male";
    case "celebrity":
    case "public figure":
    case "famous person":
      return "has_celebrity";
    case "face":
    case "human face":
    case "portrait":
      return "has_human_face";
    default:
      return null;
  }
}

function getFacetIntentBoost(query: string, row: HybridSearchRow): number {
  const facetName = typeof row.metadata.facet_name === "string" ? row.metadata.facet_name : null;
  const facetValue = typeof row.metadata.facet_value === "string" ? row.metadata.facet_value.toLowerCase() : null;
  const queryTokens = new Set(tokenize(query));

  if (queryTokens.size !== 1 || !facetName || !facetValue) {
    return 0;
  }

  if (queryTokens.has("female") && facetName === "features_female" && facetValue === "true") {
    return 0.08;
  }

  if (queryTokens.has("male") && facetName === "features_male" && facetValue === "true") {
    return 0.08;
  }

  if (queryTokens.has("celebrity") && facetName === "has_celebrity" && facetValue === "true") {
    return 0.06;
  }

  if (queryTokens.has("face") && facetName === "has_human_face" && facetValue === "true") {
    return 0.05;
  }

  return 0;
}

function getFacetRowPrior(row: HybridSearchRow): number {
  const facetName = typeof row.metadata.facet_name === "string" ? row.metadata.facet_name : null;

  switch (facetName) {
    case "has_celebrity":
    case "has_human_face":
    case "features_female":
    case "features_male":
    case "has_screenshot_ui":
    case "has_text_overlay":
    case "has_chart_or_graph":
    case "has_logo_or_watermark":
      return 0.05;
    case "caption_brief":
    case "scene_description":
    case "primary_subjects":
    case "secondary_subjects":
    case "visible_objects":
    case "reference_entity":
    case "reference_source":
    case "cultural_reference":
      return 0.02;
    case "video_music":
    case "video_sound":
    case "video_dialogue":
    case "confidence_notes":
    case "usage_notes":
      return -0.08;
    default:
      return 0;
  }
}

function getHybridRowIdentity(row: HybridSearchRow): string {
  const duplicateGroupId =
    row.media?.duplicateGroupId ??
    (typeof row.metadata.duplicate_group_id === "string" && row.metadata.duplicate_group_id.length > 0
      ? row.metadata.duplicate_group_id
      : null);
  if (duplicateGroupId) {
    return `group:${duplicateGroupId}`;
  }

  const assetId =
    row.media?.mediaAssetId ??
    (typeof row.metadata.asset_id === "string" && row.metadata.asset_id.length > 0 ? row.metadata.asset_id : null);
  if (assetId) {
    return `asset:${assetId}`;
  }

  const usageId =
    typeof row.metadata.usage_id === "string" && row.metadata.usage_id.length > 0 ? row.metadata.usage_id : null;
  if (usageId) {
    return `usage:${usageId}`;
  }

  return `row:${row.id}`;
}

function getHybridRowScore(row: HybridSearchRow): number {
  return row.combinedScore || row.vectorScore * hybridVectorWeight + row.lexicalScore * hybridLexicalWeight;
}

function dedupeHybridRows(rows: HybridSearchRow[]): HybridSearchRow[] {
  const deduped = new Map<string, HybridSearchRow>();

  for (const row of rows) {
    const key = getHybridRowIdentity(row);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, row);
      continue;
    }

    const rowScore = getHybridRowScore(row);
    const existingScore = getHybridRowScore(existing);
    const preferred = rowScore > existingScore ? row : existing;
    const secondary = preferred === row ? existing : row;

    deduped.set(key, {
      ...preferred,
      matchedBy: Array.from(new Set([...preferred.matchedBy, ...secondary.matchedBy])),
      vectorScore: Math.max(preferred.vectorScore, secondary.vectorScore),
      lexicalScore: Math.max(preferred.lexicalScore, secondary.lexicalScore),
      combinedScore: Math.max(rowScore, existingScore)
    });
  }

  return Array.from(deduped.values());
}

export interface TopicSearchRow {
  id: string;
  document: string;
  metadata: Metadata;
  tweet: {
    tweetKey: string;
    tweetId: string | null;
    authorUsername: string | null;
    text: string | null;
    createdAt: string | null;
  };
  topic: {
    topicId: string | null;
    label: string | null;
    hotnessScore: number;
    tweetCount: number;
    isStale: boolean;
  };
  analysis: {
    analysisId: string;
    summaryLabel: string | null;
    isNews: boolean;
    newsPeg: string | null;
    whyNow: string | null;
    sentiment: TweetTopicAnalysisRecord["sentiment"];
    stance: TweetTopicAnalysisRecord["stance"];
    emotionalTone: string | null;
    opinionIntensity: TweetTopicAnalysisRecord["opinionIntensity"];
    targetEntity: string | null;
    signals: string[];
  };
  usageIds: string[];
  vectorDistance: number | null;
  vectorScore: number;
  lexicalScore: number;
  combinedScore: number;
  matchedBy: Array<"vector" | "lexical">;
}

export interface TopicSearchResult {
  query: string;
  limit: number;
  results: TopicSearchRow[];
}

interface FacetSearchContext {
  tweetText?: string | null;
  authorUsername?: string | null;
}

interface TopicSearchContext {
  topicClustersByNormalizedLabel: Map<string, TopicClusterRecord>;
  usagesById: Map<string, TweetUsageRecord>;
}

function normalizeScore(value: number, maxValue: number): number {
  if (!Number.isFinite(value) || maxValue <= 0) {
    return 0;
  }

  return value / maxValue;
}

function normalizeDistanceScore(
  distance: number | null,
  minDistance: number,
  maxDistance: number
): number {
  if (distance === null || !Number.isFinite(distance)) {
    return 0;
  }

  if (!Number.isFinite(minDistance) || !Number.isFinite(maxDistance)) {
    return 0;
  }

  if (maxDistance <= minDistance) {
    return 1;
  }

  return 1 - (distance - minDistance) / (maxDistance - minDistance);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function normalizeTopicLabel(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[“”"']/g, "")
    .replace(/\.$/, "")
    .toLowerCase();

  return normalized || null;
}

function collectTopicFacetValues(usages: TweetUsageRecord[]): string[] {
  const values = new Set<string>();
  const facets: Array<keyof UsageAnalysis> = [
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
    "trend_signal"
  ];

  for (const usage of usages) {
    for (const facet of facets) {
      const value = usage.analysis[facet];
      if (typeof value === "string" && value.trim()) {
        values.add(`${facet}: ${value.trim()}`);
      }
    }

    for (const value of usage.analysis.brand_signals) {
      if (value.trim()) {
        values.add(`brand_signal: ${value.trim()}`);
      }
    }

    for (const value of usage.analysis.search_keywords) {
      if (value.trim()) {
        values.add(`search_keyword: ${value.trim()}`);
      }
    }
  }

  return Array.from(values);
}

function buildTopicDocument(analysis: TweetTopicAnalysisRecord, usages: TweetUsageRecord[]): string {
  const lines = [
    "analysis_scope: topic_tweet",
    `analysis_id: ${analysis.analysisId}`,
    `tweet_key: ${analysis.tweetKey}`,
    `summary_label: ${analysis.summaryLabel ?? "none"}`,
    `is_news: ${analysis.isNews ? "true" : "false"}`,
    `sentiment: ${analysis.sentiment}`,
    `stance: ${analysis.stance}`,
    `opinion_intensity: ${analysis.opinionIntensity}`
  ];

  if (analysis.targetEntity) {
    lines.push(`target_entity: ${analysis.targetEntity}`);
  }

  if (analysis.newsPeg) {
    lines.push(`news_peg: ${analysis.newsPeg}`);
  }

  if (analysis.whyNow) {
    lines.push(`why_now: ${analysis.whyNow}`);
  }

  if (analysis.emotionalTone) {
    lines.push(`emotional_tone: ${analysis.emotionalTone}`);
  }

  if (analysis.text) {
    lines.push(`tweet_text: ${analysis.text}`);
  }

  if (analysis.authorUsername) {
    lines.push(`author_username: ${analysis.authorUsername}`);
  }

  if (analysis.signals.length > 0) {
    lines.push(`signals: ${analysis.signals.map((signal) => signal.label).join(", ")}`);
  }

  for (const value of collectTopicFacetValues(usages)) {
    lines.push(value);
  }

  return lines.join("\n");
}

function buildTopicMetadata(
  analysis: TweetTopicAnalysisRecord,
  topicCluster: TopicClusterRecord | null
): Record<string, string | number | boolean | null> {
  return {
    analysis_scope: "topic_tweet",
    analysis_id: analysis.analysisId,
    tweet_key: analysis.tweetKey,
    tweet_id: analysis.tweetId ?? "unknown",
    author_username: analysis.authorUsername ?? "unknown",
    summary_label: analysis.summaryLabel,
    topic_id: topicCluster?.topicId ?? null,
    topic_label: topicCluster?.label ?? analysis.summaryLabel,
    sentiment: analysis.sentiment,
    stance: analysis.stance,
    emotional_tone: analysis.emotionalTone,
    opinion_intensity: analysis.opinionIntensity,
    target_entity: analysis.targetEntity,
    is_news: analysis.isNews,
    topic_hotness_score: topicCluster?.hotnessScore ?? 0,
    topic_tweet_count: topicCluster?.tweetCount ?? 0
  };
}

function buildTopicSearchContext(): TopicSearchContext {
  const data = getDashboardData();
  return {
    topicClustersByNormalizedLabel: new Map(
      data.topicClusters
        .map((cluster) => [normalizeTopicLabel(cluster.label), cluster] as const)
        .filter((entry): entry is [string, TopicClusterRecord] => Boolean(entry[0]))
    ),
    usagesById: new Map(data.tweetUsages.map((usage) => [usage.usageId, usage]))
  };
}

function buildChromaWhereClause(filters: Where[]): Where | undefined {
  if (filters.length === 0) {
    return undefined;
  }

  if (filters.length === 1) {
    return filters[0];
  }

  return { $and: filters };
}

function findTopicCluster(
  analysis: TweetTopicAnalysisRecord,
  context: TopicSearchContext
): TopicClusterRecord | null {
  const normalized = normalizeTopicLabel(analysis.summaryLabel);
  if (!normalized) {
    return null;
  }

  return context.topicClustersByNormalizedLabel.get(normalized) ?? null;
}

function buildTopicSearchRow(input: {
  id: string;
  document: string;
  metadata: Metadata;
  analysis: TweetTopicAnalysisRecord;
  topicCluster: TopicClusterRecord | null;
  vectorDistance: number | null;
  vectorScore: number;
  lexicalScore: number;
  matchedBy: Array<"vector" | "lexical">;
}): TopicSearchRow {
  return {
    id: input.id,
    document: input.document,
    metadata: input.metadata,
    tweet: {
      tweetKey: input.analysis.tweetKey,
      tweetId: input.analysis.tweetId,
      authorUsername: input.analysis.authorUsername,
      text: input.analysis.text,
      createdAt: input.analysis.createdAt
    },
    topic: {
      topicId: input.topicCluster?.topicId ?? null,
      label: input.topicCluster?.label ?? input.analysis.summaryLabel,
      hotnessScore: input.topicCluster?.hotnessScore ?? 0,
      tweetCount: input.topicCluster?.tweetCount ?? 0,
      isStale: input.topicCluster?.isStale ?? false
    },
    analysis: {
      analysisId: input.analysis.analysisId,
      summaryLabel: input.analysis.summaryLabel,
      isNews: input.analysis.isNews,
      newsPeg: input.analysis.newsPeg,
      whyNow: input.analysis.whyNow,
      sentiment: input.analysis.sentiment,
      stance: input.analysis.stance,
      emotionalTone: input.analysis.emotionalTone,
      opinionIntensity: input.analysis.opinionIntensity,
      targetEntity: input.analysis.targetEntity,
      signals: input.analysis.signals.map((signal) => signal.label)
    },
    usageIds: input.analysis.usageIds,
    vectorDistance: input.vectorDistance,
    vectorScore: input.vectorScore,
    lexicalScore: input.lexicalScore,
    combinedScore: 0,
    matchedBy: input.matchedBy
  };
}

function buildFacetDocument(
  analysis: UsageAnalysis,
  facetName: AnalysisFacetName,
  context?: FacetSearchContext
): string | null {
  const facetText = facetValueToSearchText(analysis, facetName);
  if (!facetText) {
    return null;
  }

  const lines = [
    `value: ${facetText}`,
    `media_kind: ${analysis.mediaKind}`
  ];
  const semanticSummary = buildSemanticSearchSummary(analysis, context);
  if (semanticSummary) {
    lines.push(`semantic_summary: ${semanticSummary}`);
  }
  const searchArchetypes = deriveSearchArchetypes(analysis);
  if (searchArchetypes.length > 0) {
    lines.push(`search_archetypes: ${searchArchetypes.join(", ")}`);
  }
  const lexicalPhrases = buildFacetLexicalPhrases(analysis, facetName);
  if (lexicalPhrases.length > 0) {
    lines.push(`search_terms: ${lexicalPhrases.join(", ")}`);
  }

  if (context?.tweetText) {
    lines.push(`tweet_text: ${context.tweetText}`);
  }

  if (context?.authorUsername) {
    lines.push(`author_username: ${context.authorUsername}`);
  }

  if (analysis.caption_brief) {
    lines.push(`caption_brief: ${analysis.caption_brief}`);
  }

  if (analysis.scene_description) {
    lines.push(`scene_description: ${analysis.scene_description}`);
  }

  if (analysis.ocr_text) {
    lines.push(`ocr_text: ${analysis.ocr_text}`);
  }

  if (analysis.setting_context) {
    lines.push(`setting_context: ${analysis.setting_context}`);
  }

  if (analysis.action_or_event) {
    lines.push(`action_or_event: ${analysis.action_or_event}`);
  }

  if (analysis.primary_subjects.length > 0) {
    lines.push(`primary_subjects: ${analysis.primary_subjects.join(", ")}`);
  }

  if (analysis.secondary_subjects.length > 0) {
    lines.push(`secondary_subjects: ${analysis.secondary_subjects.join(", ")}`);
  }

  if (analysis.visible_objects.length > 0) {
    lines.push(`visible_objects: ${analysis.visible_objects.join(", ")}`);
  }

  if (analysis.reference_entity) {
    lines.push(`reference_entity: ${analysis.reference_entity}`);
  }

  if (analysis.reference_source) {
    lines.push(`reference_source: ${analysis.reference_source}`);
  }

  if (analysis.reference_plot_context) {
    lines.push(`reference_plot_context: ${analysis.reference_plot_context}`);
  }

  if (analysis.analogy_target) {
    lines.push(`analogy_target: ${analysis.analogy_target}`);
  }

  if (analysis.analogy_scope) {
    lines.push(`analogy_scope: ${analysis.analogy_scope}`);
  }

  if (analysis.brand_signals.length > 0) {
    lines.push(`brand_signals: ${analysis.brand_signals.join(", ")}`);
  }

  if (analysis.search_keywords.length > 0) {
    lines.push(`search_keywords: ${analysis.search_keywords.join(", ")}`);
  }

  return lines.join("\n");
}

function buildAssetSearchDocument(
  analysis: UsageAnalysis,
  context?: FacetSearchContext,
  facetName?: AnalysisFacetName
): string | null {
  if (facetName) {
    return buildFacetDocument(analysis, facetName, context);
  }

  const lines = [`analysis_scope: ${assetSearchScope}`, `media_kind: ${analysis.mediaKind}`];
  const semanticSummary = buildSemanticSearchSummary(analysis, context);
  if (semanticSummary) {
    lines.push(`semantic_summary: ${semanticSummary}`);
  }
  const searchArchetypes = deriveSearchArchetypes(analysis);
  if (searchArchetypes.length > 0) {
    lines.push(`search_archetypes: ${searchArchetypes.join(", ")}`);
  }

  if (context?.tweetText) {
    lines.push(`tweet_text: ${context.tweetText}`);
  }

  if (context?.authorUsername) {
    lines.push(`author_username: ${context.authorUsername}`);
  }

  for (const candidateFacet of ANALYSIS_FACET_NAMES) {
    const facetText = facetValueToSearchText(analysis, candidateFacet);
    if (!facetText) {
      continue;
    }

    lines.push(`${candidateFacet}: ${facetText}`);
  }

  return lines.length > 2 ? lines.join("\n") : null;
}

interface AssetSearchGroupEntry {
  groupId: string;
  summaries: MediaAssetSummary[];
  representativeUsage: TweetUsageRecord | null;
  representativeAssetId: string | null;
  assetIds: string[];
}

function buildGroupSearchDocument(input: {
  summaries: MediaAssetSummary[];
  representativeUsage: TweetUsageRecord | null;
  facetName?: AnalysisFacetName;
}): string | null {
  const documents = input.summaries
    .map((summary) =>
      summary.summary && summary.summary.status === "complete"
        ? buildAssetSearchDocument(
            summary.summary,
            {
              tweetText: input.representativeUsage?.tweet.text ?? null,
              authorUsername: input.representativeUsage?.tweet.authorUsername ?? null
            },
            input.facetName
          )
        : null
    )
    .filter((value): value is string => Boolean(value));

  if (documents.length === 0) {
    return null;
  }

  return Array.from(new Set(documents)).join("\n---\n");
}

function buildGroupSearchMetadata(input: {
  groupId: string;
  summaries: MediaAssetSummary[];
  representativeUsage: TweetUsageRecord | null;
  representativeAssetId: string | null;
  facetName?: AnalysisFacetName;
}): Record<string, string | number | boolean | null> {
  const analyses = input.summaries
    .map((summary) => summary.summary)
    .filter((analysis): analysis is UsageAnalysis => Boolean(analysis && analysis.status === "complete"));
  const representativeAnalysis = analyses[0] ?? null;
  const facetValues = input.facetName
    ? Array.from(
        new Set(
          analyses
            .map((analysis) => facetValueToText(analysis[input.facetName!]))
            .filter((value): value is string => Boolean(value))
        )
      )
    : [];

  return {
    analysis_scope: assetSearchScope,
    doc_variant: input.facetName ? "facet" : assetSearchAllVariant,
    asset_id: input.representativeAssetId,
    duplicate_group_id: input.groupId,
    usage_id: input.representativeUsage?.usageId ?? input.summaries[0]?.sourceUsageId ?? "",
    tweet_id: input.representativeUsage?.tweet.tweetId ?? "unknown",
    author_username: input.representativeUsage?.tweet.authorUsername ?? "unknown",
    facet_name: input.facetName ?? null,
    facet_description: input.facetName ? ANALYSIS_FACET_DESCRIPTIONS[input.facetName] : null,
    facet_value: input.facetName ? facetValues.join(" | ") : null,
    media_index: input.representativeUsage?.mediaIndex ?? 0,
    media_kind: representativeAnalysis?.mediaKind ?? input.representativeUsage?.analysis.mediaKind ?? "unknown",
    usage_count: input.summaries.reduce((sum, summary) => sum + summary.usageCount, 0),
    complete_analysis_count: input.summaries.reduce((sum, summary) => sum + summary.completeAnalysisCount, 0)
  };
}

function buildHybridRowMedia(usage: TweetUsageRecord | null): HybridSearchRow["media"] {
  if (!usage) {
    return null;
  }

  const media = usage.tweet.media[usage.mediaIndex];
  return {
    mediaAssetId: usage.mediaAssetId,
    mediaLocalFilePath: usage.mediaLocalFilePath,
    mediaPlayableFilePath: usage.mediaPlayableFilePath,
    sourceUrl: media?.sourceUrl ?? null,
    previewUrl: media?.previewUrl ?? null,
    posterUrl: media?.posterUrl ?? null,
    tweetUrl: usage.tweet.tweetUrl,
    tweetText: usage.tweet.text,
    authorHandle: usage.tweet.authorHandle,
    authorUsername: usage.tweet.authorUsername,
    authorDisplayName: usage.tweet.authorDisplayName,
    createdAt: usage.tweet.createdAt,
    mediaIndex: usage.mediaIndex,
    duplicateGroupId: usage.duplicateGroupId,
    duplicateGroupUsageCount: usage.duplicateGroupUsageCount,
    hotnessScore: usage.hotnessScore,
    mediaAssetStarred: usage.mediaAssetStarred,
    mediaAssetUsageCount: usage.mediaAssetUsageCount,
    phashMatchCount: usage.phashMatchCount
  };
}

function buildAssetSearchCorpus(params: {
  facetName?: AnalysisFacetName;
}): Array<{
  id: string;
  document: string;
  metadata: Record<string, string | number | boolean | null>;
  media: HybridSearchRow["media"];
  tokens: string[];
}> {
  const cacheKey = `${getReadModelCacheKey()}::asset-search-corpus`;
  if (assetSearchCorpusCache?.key !== cacheKey) {
    assetSearchCorpusCache = {
      key: cacheKey,
      corporaByFacet: new Map()
    };
  }

  const facetCacheKey = params.facetName ?? "__all__";
  const cachedCorpus = assetSearchCorpusCache.corporaByFacet.get(facetCacheKey);
  if (cachedCorpus) {
    return cachedCorpus;
  }

  const usageMap = new Map(getLightweightUsageData().map((usage) => [usage.usageId, usage]));
  const assetIndex = readMediaAssetIndex();
  const summaryFile = readMediaAssetSummaries();

  if (!assetIndex || !summaryFile) {
    return [];
  }

  const summariesByAssetId = new Map(summaryFile.summaries.map((summary) => [summary.assetId, summary]));
  const groups = new Map<string, AssetSearchGroupEntry>();

  for (const asset of assetIndex.assets) {
    const summary = summariesByAssetId.get(asset.assetId);
    if (!summary?.summary || summary.summary.status !== "complete") {
      continue;
    }

    const usages = asset.usageIds.map((usageId) => usageMap.get(usageId) ?? null).filter((usage): usage is TweetUsageRecord => Boolean(usage));
    const representativeUsage =
      (summary.sourceUsageId ? usageMap.get(summary.sourceUsageId) ?? null : null) ??
      usages[0] ??
      null;
    const groupId = representativeUsage?.duplicateGroupId ?? asset.assetId;
    const existing = groups.get(groupId);

    if (existing) {
      existing.summaries.push(summary);
      existing.assetIds.push(asset.assetId);
      if (!existing.representativeUsage && representativeUsage) {
        existing.representativeUsage = representativeUsage;
        existing.representativeAssetId = asset.assetId;
      }
      continue;
    }

    groups.set(groupId, {
      groupId,
      summaries: [summary],
      representativeUsage,
      representativeAssetId: asset.assetId,
      assetIds: [asset.assetId]
    });
  }

  const corpus = Array.from(groups.values()).flatMap((group) => {
    const document = buildGroupSearchDocument({
      summaries: group.summaries,
      representativeUsage: group.representativeUsage,
      facetName: params.facetName
    });

    if (!document) {
      return [];
    }

    const id = params.facetName
      ? `${group.groupId}::group-search::${params.facetName}`
      : `${group.groupId}::group-search`;

    return [{
      id,
      document,
      metadata: buildGroupSearchMetadata({
        groupId: group.groupId,
        summaries: group.summaries,
        representativeUsage: group.representativeUsage,
        representativeAssetId: group.representativeAssetId,
        facetName: params.facetName
      }),
      media: buildHybridRowMedia(group.representativeUsage),
      tokens: tokenize(document)
    }];
  });

  assetSearchCorpusCache.corporaByFacet.set(facetCacheKey, corpus);
  return corpus;
}

function buildLexicalRows(params: {
  query: string;
  facetName?: AnalysisFacetName;
  limit: number;
  allFacetsMode: "facet_concat" | "combined_blob";
}): HybridSearchRow[] {
  if (!params.facetName && params.allFacetsMode === "facet_concat") {
    return dedupeHybridRows(
      ANALYSIS_FACET_NAMES.flatMap((facetName) =>
        buildLexicalRows({
          query: params.query,
          facetName,
          limit: params.limit,
          allFacetsMode: "combined_blob"
        })
      )
    );
  }

  const docs = buildAssetSearchCorpus({
    facetName: params.facetName
  });

  const queryTokens = tokenize(params.query);
  if (queryTokens.length === 0) {
    return [];
  }

  const docFrequency = new Map<string, number>();
  for (const doc of docs) {
    for (const token of new Set(doc.tokens)) {
      docFrequency.set(token, (docFrequency.get(token) ?? 0) + 1);
    }
  }

  const avgDocLength = docs.length > 0 ? docs.reduce((sum, doc) => sum + doc.tokens.length, 0) / docs.length : 0;
  const k1 = 1.2;
  const b = 0.75;

  const scored = docs
    .map((doc) => {
      const termCounts = new Map<string, number>();
      for (const token of doc.tokens) {
        termCounts.set(token, (termCounts.get(token) ?? 0) + 1);
      }

      const score = queryTokens.reduce((sum, token) => {
        const tf = termCounts.get(token) ?? 0;
        if (tf === 0) {
          return sum;
        }

        const df = docFrequency.get(token) ?? 0;
        const idf = Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
        const numerator = tf * (k1 + 1);
        const denominator = tf + k1 * (1 - b + (b * doc.tokens.length) / Math.max(avgDocLength, 1));
        return sum + idf * (numerator / denominator);
      }, 0);

      return { doc, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  const maxScore = scored[0]?.score ?? 0;

  return scored.slice(0, Math.max(params.limit * 4, 40)).map(({ doc, score }) => ({
    id: doc.id,
    document: doc.document,
    metadata: doc.metadata,
    media: doc.media,
    vectorDistance: null,
    vectorScore: 0,
    lexicalScore: normalizeScore(score, maxScore),
    combinedScore: 0,
    matchedBy: ["lexical"]
  }));
}

function buildTopicLexicalRows(params: {
  query: string;
  limit: number;
  context: TopicSearchContext;
}): TopicSearchRow[] {
  const analyses = readAllTopicAnalyses();
  const docs: Array<{
    id: string;
    document: string;
    metadata: Record<string, string | number | boolean | null>;
    analysis: TweetTopicAnalysisRecord;
    topicCluster: TopicClusterRecord | null;
    tokens: string[];
  }> = [];

  for (const analysis of analyses) {
    const usages = analysis.usageIds
      .map((usageId) => params.context.usagesById.get(usageId))
      .filter((usage): usage is TweetUsageRecord => Boolean(usage));
    const topicCluster = findTopicCluster(analysis, params.context);
    const document = buildTopicDocument(analysis, usages);
    docs.push({
      id: analysis.analysisId,
      document,
      metadata: buildTopicMetadata(analysis, topicCluster),
      analysis,
      topicCluster,
      tokens: tokenize(document)
    });
  }

  const queryTokens = tokenize(params.query);
  if (queryTokens.length === 0) {
    return [];
  }

  const docFrequency = new Map<string, number>();
  for (const doc of docs) {
    for (const token of new Set(doc.tokens)) {
      docFrequency.set(token, (docFrequency.get(token) ?? 0) + 1);
    }
  }

  const avgDocLength = docs.length > 0 ? docs.reduce((sum, doc) => sum + doc.tokens.length, 0) / docs.length : 0;
  const k1 = 1.2;
  const b = 0.75;

  const scored = docs
    .map((doc) => {
      const termCounts = new Map<string, number>();
      for (const token of doc.tokens) {
        termCounts.set(token, (termCounts.get(token) ?? 0) + 1);
      }

      const score = queryTokens.reduce((sum, token) => {
        const tf = termCounts.get(token) ?? 0;
        if (tf === 0) {
          return sum;
        }

        const df = docFrequency.get(token) ?? 0;
        const idf = Math.log(1 + (docs.length - df + 0.5) / (df + 0.5));
        const numerator = tf * (k1 + 1);
        const denominator = tf + k1 * (1 - b + (b * doc.tokens.length) / Math.max(avgDocLength, 1));
        return sum + idf * (numerator / denominator);
      }, 0);

      return { doc, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  const maxScore = scored[0]?.score ?? 0;

  return scored.slice(0, Math.max(params.limit * 4, 40)).map(({ doc, score }) =>
    buildTopicSearchRow({
      id: doc.id,
      document: doc.document,
      metadata: doc.metadata,
      analysis: doc.analysis,
      topicCluster: doc.topicCluster,
      vectorDistance: null,
      vectorScore: 0,
      lexicalScore: normalizeScore(score, maxScore),
      matchedBy: ["lexical"]
    })
  );
}

async function indexAssetSearchDocuments(input: {
  summaries: MediaAssetSummary[];
  usages: TweetUsageRecord[];
  assetIds?: string[] | null;
}): Promise<{ indexedCount: number }> {
  const targetGroupIds =
    input.assetIds && input.assetIds.length > 0
      ? Array.from(
          new Set(
            input.usages
              .filter((usage) => usage.mediaAssetId && input.assetIds?.includes(usage.mediaAssetId))
              .map((usage) => usage.duplicateGroupId ?? usage.mediaAssetId)
              .filter((value): value is string => Boolean(value))
          )
        )
      : null;
  const targetGroupIdSet = new Set(targetGroupIds ?? []);

  if (targetGroupIds && targetGroupIds.length === 0) {
    return { indexedCount: 0 };
  }

  const corpusRows = [
    ...buildAssetSearchCorpus({}),
    ...ANALYSIS_FACET_NAMES.flatMap((facetName) => buildAssetSearchCorpus({ facetName }))
  ].filter((row) => {
    if (!targetGroupIdSet.size) {
      return true;
    }

    const groupId =
      typeof row.metadata.duplicate_group_id === "string" ? row.metadata.duplicate_group_id : null;
    return Boolean(groupId && targetGroupIdSet.has(groupId));
  });
  const idsToDelete = [
    ...(input.assetIds ?? []).flatMap((assetId) => [
      `${assetId}::asset-search`,
      ...ANALYSIS_FACET_NAMES.map((facetName) => `${assetId}::asset-search::${facetName}`)
    ]),
    ...(targetGroupIds ?? []).flatMap((groupId) => [
      `${groupId}::group-search`,
      ...ANALYSIS_FACET_NAMES.map((facetName) => `${groupId}::group-search::${facetName}`)
    ])
  ];

  try {
    await deleteDocumentIds(idsToDelete);

    if (corpusRows.length === 0) {
      return { indexedCount: 0 };
    }

    const ids = corpusRows.map((row) => row.id);
    const docs = corpusRows.map((row) => row.document);
    const metadatas = corpusRows.map((row) => row.metadata);
    const embeddings = await embedTexts(docs);
    return upsertWithExplicitEmbeddings({
      ids,
      documents: docs,
      metadatas,
      embeddings
    });
  } catch (error) {
    console.warn(`Skipping asset-summary indexing. ${getErrorMessage(error)}`);
    return { indexedCount: 0 };
  }
}

export async function syncFacetSearchAssetIndex(input: {
  summaries: MediaAssetSummary[];
  usages: TweetUsageRecord[];
  assetIds?: string[] | null;
}): Promise<{ indexedCount: number }> {
  return indexAssetSearchDocuments(input);
}

export async function indexUsageAnalysisInChroma(
  tweet: ExtractedTweet,
  analysis: UsageAnalysis
): Promise<{ indexedCount: number }> {
  const docs: string[] = [];
  const ids: string[] = [];
  const metadatas: Metadata[] = [];

  for (const facetName of ANALYSIS_FACET_NAMES) {
    const rawValue = analysis[facetName];
    const facetText = facetValueToText(rawValue);
    if (!facetText) {
      continue;
    }

    ids.push(`${analysis.usageId}::${facetName}`);
    docs.push(
      buildFacetDocument(analysis, facetName, {
        tweetText: tweet.text,
        authorUsername: tweet.authorUsername
      }) ?? ""
    );
    metadatas.push({
      usage_id: analysis.usageId,
      tweet_id: analysis.tweetId ?? "unknown",
      author_username: tweet.authorUsername ?? "unknown",
      facet_name: facetName,
      media_kind: analysis.mediaKind
    });
  }

  if (docs.length === 0) {
    return { indexedCount: 0 };
  }

  try {
    const embeddings = await embedTexts(docs);
    return upsertWithExplicitEmbeddings({
      ids,
      documents: docs,
      metadatas,
      embeddings
    });
  } catch (error) {
    console.warn(`Skipping Chroma indexing for usage ${analysis.usageId}. ${getErrorMessage(error)}`);
    return { indexedCount: 0 };
  }
}

export async function indexAssetVideoAnalysisInChroma(
  asset: MediaAssetRecord,
  representativeUsage: TweetUsageRecord | null,
  analysis: UsageAnalysis
): Promise<{ indexedCount: number }> {
  const docs: string[] = [];
  const ids: string[] = [];
  const metadatas: Metadata[] = [];

  for (const facetName of ANALYSIS_FACET_NAMES) {
    const rawValue = analysis[facetName];
    const facetText = facetValueToText(rawValue);
    if (!facetText) {
      continue;
    }

    ids.push(`${asset.assetId}::video::${facetName}`);
    docs.push(
      [
        buildFacetDocument(analysis, facetName, {
          tweetText: representativeUsage?.tweet.text ?? null,
          authorUsername: representativeUsage?.tweet.authorUsername ?? null
        }),
        `asset_id: ${asset.assetId}`,
        "analysis_scope: asset_video"
      ]
        .filter((value): value is string => Boolean(value))
        .join("\n")
    );
    metadatas.push({
      usage_id: representativeUsage?.usageId ?? "",
      tweet_id: representativeUsage?.tweet.tweetId ?? "unknown",
      asset_id: asset.assetId,
      author_username: representativeUsage?.tweet.authorUsername ?? "unknown",
      facet_name: facetName,
      media_kind: analysis.mediaKind,
      analysis_scope: "asset_video"
    });
  }

  if (docs.length === 0) {
    return { indexedCount: 0 };
  }

  try {
    const embeddings = await embedTexts(docs);
    return upsertWithExplicitEmbeddings({
      ids,
      documents: docs,
      metadatas,
      embeddings
    });
  } catch (error) {
    console.warn(`Skipping Chroma indexing for asset video ${asset.assetId}. ${getErrorMessage(error)}`);
    return { indexedCount: 0 };
  }
}

export async function indexTopicAnalysisInChroma(
  analysis: TweetTopicAnalysisRecord,
  usages: TweetUsageRecord[]
): Promise<{ indexedCount: number }> {
  const context = buildTopicSearchContext();
  const topicCluster = findTopicCluster(analysis, context);
  const document = buildTopicDocument(analysis, usages);
  const metadata = buildTopicMetadata(analysis, topicCluster);

  try {
    const embeddings = await embedTexts([document]);
    return upsertWithExplicitEmbeddings({
      ids: [analysis.analysisId],
      documents: [document],
      metadatas: [metadata],
      embeddings
    });
  } catch (error) {
    console.warn(`Skipping Chroma indexing for topic analysis ${analysis.analysisId}. ${getErrorMessage(error)}`);
    return { indexedCount: 0 };
  }
}

export async function searchTopicIndex(params: {
  query: string;
  limit?: number;
}): Promise<TopicSearchResult> {
  const limit = params.limit ?? 12;
  const context = buildTopicSearchContext();
  const analyses = readAllTopicAnalyses();
  const analysesById = new Map(analyses.map((analysis) => [analysis.analysisId, analysis]));
  const lexicalRows = buildTopicLexicalRows({
    query: params.query,
    limit,
    context
  });

  let vectorRows: TopicSearchRow[] = [];
  try {
    const collection = await getCollection();
    const queryEmbeddings = [await embedQueryText(params.query)];
    const result = await collection.query({
      queryEmbeddings,
      nResults: Math.max(limit * 4, 40),
      where: buildChromaWhereClause([{ analysis_scope: "topic_tweet" }]),
      include: ["documents", "metadatas", "distances"]
    });

    const distances = (result.distances?.[0] ?? []).filter(
      (distance): distance is number => typeof distance === "number"
    );
    const maxDistance = distances.length > 0 ? Math.max(...distances) : 0;
    const minDistance = distances.length > 0 ? Math.min(...distances) : 0;

    vectorRows =
      result.ids?.[0]?.flatMap((id, index) => {
        const analysis = analysesById.get(id);
        if (!analysis) {
          return [];
        }

        const distance = distances[index] ?? null;
        const vectorScore = normalizeDistanceScore(distance, minDistance, maxDistance);
        const topicCluster = findTopicCluster(analysis, context);

        return [
          buildTopicSearchRow({
            id,
            document: result.documents?.[0]?.[index] ?? "",
            metadata: result.metadatas?.[0]?.[index] ?? {},
            analysis,
            topicCluster,
            vectorDistance: distance,
            vectorScore,
            lexicalScore: 0,
            matchedBy: ["vector"]
          })
        ];
      }) ?? [];
  } catch (error) {
    console.warn(
      `Topic vector search failed, falling back to lexical only: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const merged = new Map<string, TopicSearchRow>();

  for (const row of vectorRows) {
    merged.set(row.id, row);
  }

  for (const row of lexicalRows) {
    const existing = merged.get(row.id);
    if (!existing) {
      merged.set(row.id, row);
      continue;
    }

    merged.set(row.id, {
      ...existing,
      lexicalScore: row.lexicalScore,
      combinedScore: 0,
      matchedBy: Array.from(new Set([...existing.matchedBy, "lexical"]))
    });
  }

  const rows = Array.from(merged.values())
    .map((row) => ({
      ...row,
      combinedScore: row.vectorScore * hybridVectorWeight + row.lexicalScore * hybridLexicalWeight
    }))
    .sort((left, right) => {
      if (right.combinedScore !== left.combinedScore) {
        return right.combinedScore - left.combinedScore;
      }

      if (right.topic.hotnessScore !== left.topic.hotnessScore) {
        return right.topic.hotnessScore - left.topic.hotnessScore;
      }

      if (left.vectorDistance !== null && right.vectorDistance !== null && left.vectorDistance !== right.vectorDistance) {
        return left.vectorDistance - right.vectorDistance;
      }

      return right.lexicalScore - left.lexicalScore;
    })
    .slice(0, limit);

  return {
    query: params.query,
    limit,
    results: rows
  };
}

export async function searchFacetIndex(params: {
  query: string;
  facetName?: AnalysisFacetName;
  limit?: number;
  mediaKinds?: string[] | null;
  highQualityOnly?: boolean;
  allFacetsMode?: "facet_concat" | "combined_blob";
  hardMatchMode?: "off" | "intent";
}): Promise<HybridSearchResult> {
  const perf = createPerfTrace("search-facets", {
    facetName: params.facetName ?? null,
    limit: params.limit ?? 20,
    queryLength: params.query.length,
    allFacetsMode: params.allFacetsMode ?? "combined_blob"
  });
  const limit = params.limit ?? 20;
  const mediaKinds = params.mediaKinds?.map(normalizeMediaKindFilter).filter(Boolean) ?? null;
  const highQualityOnly = params.highQualityOnly ?? true;
  const allFacetsMode = params.allFacetsMode ?? "combined_blob";
  const hardMatchMode = params.hardMatchMode ?? "off";
  const effectiveFacetName =
    params.facetName ?? (hardMatchMode === "intent" ? resolveIntentFacetName(params.query) : null);
  const candidateLimit = getFacetSearchCandidateLimit(limit, highQualityOnly);
  let vectorStatus: "ok" | "unavailable" = "ok";
  let warningMessage: string | null = null;
  const usageMap = new Map(getLightweightUsageData().map((usage) => [usage.usageId, usage]));
  const lexicalRows = buildLexicalRows({
    query: params.query,
    facetName: effectiveFacetName ?? undefined,
    limit: candidateLimit,
    allFacetsMode
  });
  perf.mark("lexical_ready", {
    usageCount: usageMap.size,
    lexicalCount: lexicalRows.length,
    candidateLimit
  });

  let vectorRows: HybridSearchRow[] = [];
  try {
    const collection = await getCollection();
    const queryTexts = buildVectorQueryTexts({
      query: params.query,
      facetName: effectiveFacetName,
      allFacetsMode
    });
    const vectorQueries: Array<Where | undefined> = !effectiveFacetName && allFacetsMode === "facet_concat"
      ? ANALYSIS_FACET_NAMES.map((facetName) =>
          buildChromaWhereClause([{ analysis_scope: assetSearchScope }, { facet_name: facetName }])
        )
      : effectiveFacetName
        ? [buildChromaWhereClause([{ analysis_scope: assetSearchScope }, { facet_name: effectiveFacetName }])]
        : [buildChromaWhereClause([{ analysis_scope: assetSearchScope }, { doc_variant: assetSearchAllVariant }])];

    vectorRows = dedupeHybridRows(
      (
        await Promise.all(
          vectorQueries.map(async (where) => {
            const rowsForWhere = await Promise.all(
              queryTexts.map(async (queryText) => {
                const result = await collection.query({
                  queryEmbeddings: [await embedQueryText(queryText)],
                  nResults: Math.max(candidateLimit * 4, 40),
                  where,
                  include: ["documents", "metadatas", "distances"]
                });

                const distances = (result.distances?.[0] ?? []).filter(
                  (distance): distance is number => typeof distance === "number"
                );
                const maxDistance = distances.length > 0 ? Math.max(...distances) : 0;
                const minDistance = distances.length > 0 ? Math.min(...distances) : 0;

                return (
                  result.ids?.[0]?.map((id, index) => {
                    const distance = distances[index] ?? null;
                    const vectorScore = normalizeDistanceScore(distance, minDistance, maxDistance);

                    return {
                      id,
                      document: result.documents?.[0]?.[index] ?? "",
                      metadata: result.metadatas?.[0]?.[index] ?? {},
                      media: (() => {
                        const usageId = String(result.metadatas?.[0]?.[index]?.usage_id ?? "");
                        const usage = usageMap.get(usageId);
                        return buildHybridRowMedia(usage ?? null);
                      })(),
                      vectorDistance: distance,
                      vectorScore,
                      lexicalScore: 0,
                      combinedScore: 0,
                      matchedBy: ["vector"] as Array<"vector" | "lexical">
                    };
                  }) ?? []
                );
              })
            );

            return dedupeHybridRows(rowsForWhere.flat());
          })
        )
      ).flat()
    );
    perf.mark("vector_ready", {
      vectorCount: vectorRows.length,
      vectorQueryCount: vectorQueries.length * queryTexts.length
    });
  } catch (error) {
    vectorStatus = "unavailable";
    const details = error instanceof Error ? error.message : String(error);
    warningMessage = `Vector search is unavailable, so these results are lexical-only. ${details}`;
    console.warn(`Vector search failed, falling back to lexical only: ${details}`);
    perf.mark("vector_unavailable", {
      error: details
    });
  }

  const merged = new Map<string, HybridSearchRow>();

  for (const row of vectorRows) {
    merged.set(row.id, row);
  }

  for (const row of lexicalRows) {
    const existing = merged.get(row.id);
    if (!existing) {
      merged.set(row.id, row);
      continue;
    }

    merged.set(row.id, {
      ...existing,
      lexicalScore: row.lexicalScore,
      combinedScore: 0,
      matchedBy: Array.from(new Set([...existing.matchedBy, "lexical"]))
    });
  }

  const rankedRows = Array.from(merged.values()).map((row) => ({
    ...row,
    combinedScore:
      row.vectorScore * (row.lexicalScore > 0 ? hybridVectorWeight : hybridPureVectorWeight) +
      row.lexicalScore * hybridLexicalWeight +
      (allFacetsMode === "facet_concat" ? getFacetRowPrior(row) : 0) +
      (hardMatchMode === "intent" ? getFacetIntentBoost(params.query, row) : 0)
  }));
  const rows = (!effectiveFacetName && allFacetsMode === "facet_concat" ? dedupeHybridRows(rankedRows) : rankedRows)
    .filter((row) => rowMatchesMediaKinds(row, mediaKinds))
    .filter((row) => !highQualityOnly || rowMatchesHighQualityFilter(row))
    .sort((left, right) => {
      if (right.combinedScore !== left.combinedScore) {
        return right.combinedScore - left.combinedScore;
      }

      if (left.vectorDistance !== null && right.vectorDistance !== null && left.vectorDistance !== right.vectorDistance) {
        return left.vectorDistance - right.vectorDistance;
      }

      return right.lexicalScore - left.lexicalScore;
    })
    .slice(0, limit);
  perf.end({
    resultCount: rows.length,
    vectorStatus,
    warning: warningMessage ?? null
  });

  return {
    query: params.query,
    facetName: params.facetName ?? null,
    limit,
    vectorStatus,
    warningMessage,
    filters: {
      mediaKinds,
      highQualityOnly,
      allFacetsMode,
      hardMatchMode
    },
    results: rows
  };
}
