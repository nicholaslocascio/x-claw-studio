import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { ensureDir, writeJson } from "@/src/lib/fs";
import { buildUsageId } from "@/src/lib/usage-id";
import type {
  CrawlManifest,
  ExtractedTweet,
  MediaAssetPhashMatch,
  MediaAssetRecord,
  MediaAssetSummary,
  MediaAssetView,
  TweetMedia,
  TweetUsageRecord,
  UsageAnalysis
} from "@/src/lib/types";
import { hammingDistanceHex, computeDifferenceHash } from "@/src/server/media-fingerprint";
import { computeImageEmbedding, cosineSimilarity } from "@/src/server/media-embedding";
import { readAllUsageAnalyses } from "@/src/server/analysis-store";
import { analyzeMediaAssetVideo, promoteMediaAssetVideo, readAllAssetVideoAnalyses } from "@/src/server/media-asset-video";

const projectRoot = process.cwd();
const assetDir = path.join(projectRoot, "data", "analysis", "media-assets");
const assetIndexPath = path.join(assetDir, "index.json");
const assetSummaryPath = path.join(assetDir, "summaries.json");
const assetStarsPath = path.join(assetDir, "stars.json");

interface MediaAssetIndexFile {
  generatedAt: string;
  assets: MediaAssetRecord[];
  usageToAssetId: Record<string, string>;
}

interface MediaAssetSummaryFile {
  generatedAt: string;
  summaries: MediaAssetSummary[];
}

export interface MediaAssetIndexSyncResult {
  index: MediaAssetIndexFile;
  processedUsageIds: string[];
  touchedAssetIds: string[];
  mode: "incremental" | "full_rebuild";
}

export interface MediaAssetSummarySyncResult {
  file: MediaAssetSummaryFile;
  touchedAssetIds: string[];
  mode: "incremental" | "full_rebuild";
}

interface MediaAssetStarsFile {
  updatedAt: string;
  starredAssetIds: string[];
}

interface MediaCandidate {
  usageId: string;
  tweet: ExtractedTweet;
  mediaIndex: number;
  media: TweetMedia;
  filePath: string | null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

const EXACT_ASSET_MATCH_DISTANCE = 2;
const DEFAULT_PHASH_MATCH_DISTANCE = 4;
const DEFAULT_MEDIA_MATCH_SIMILARITY = Number(process.env.GEMINI_MEDIA_MATCH_THRESHOLD || 0.965);

function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function normalizeMediaUrl(media: TweetMedia): string | null {
  return media.posterUrl ?? media.previewUrl ?? media.sourceUrl ?? null;
}

function collectCandidateMatchUrls(candidate: MediaCandidate, manifests: CrawlManifest[]): string[] {
  return Array.from(
    new Set(
      [
        normalizeMediaUrl(candidate.media),
        candidate.media.sourceUrl,
        candidate.media.previewUrl,
        candidate.media.posterUrl,
        ...findRelatedSourceUrls(candidate.media, manifests)
      ].filter((value): value is string => Boolean(value))
    )
  );
}

export function assetMatchesCandidateByUrl(
  asset: MediaAssetRecord,
  candidateUrls: string[],
  candidateRequestKeys: string[]
): boolean {
  const assetUrls = [
    asset.canonicalMediaUrl,
    ...asset.sourceUrls,
    ...asset.previewUrls,
    ...asset.posterUrls
  ].filter((value): value is string => Boolean(value));
  const assetUrlSet = new Set(assetUrls);

  if (candidateUrls.some((url) => assetUrlSet.has(url))) {
    return true;
  }

  if (candidateRequestKeys.length === 0) {
    return false;
  }

  const assetRequestKeys = new Set(assetUrls.map((url) => extractMediaRequestKey(url)).filter(Boolean));
  return candidateRequestKeys.some((key) => assetRequestKeys.has(key));
}

function readStarredAssetIds(): Set<string> {
  const file = readJsonFile<MediaAssetStarsFile>(assetStarsPath);
  return new Set(file?.starredAssetIds ?? []);
}

export function shouldPromoteMediaAssetVideo(asset: MediaAssetRecord, duplicateGroupUsageCount: number): boolean {
  return ["video", "video_hls", "video_blob"].includes(asset.mediaKind) && (asset.starred || duplicateGroupUsageCount >= 2);
}

export function mergeExistingMediaAssetState(asset: MediaAssetRecord, existingAsset: MediaAssetRecord | null): MediaAssetRecord {
  if (!existingAsset) {
    return asset;
  }

  return {
    ...asset,
    promotedVideoSourceUrl: existingAsset.promotedVideoSourceUrl ?? asset.promotedVideoSourceUrl,
    promotedVideoFilePath: existingAsset.promotedVideoFilePath ?? asset.promotedVideoFilePath,
    createdAt: existingAsset.createdAt ?? asset.createdAt
  };
}

function writeStarredAssetIds(assetIds: Iterable<string>): void {
  ensureDir(assetDir);
  writeJson(assetStarsPath, {
    updatedAt: new Date().toISOString(),
    starredAssetIds: Array.from(new Set(assetIds)).sort()
  });
}

function hydrateAssetsWithStars(assets: MediaAssetRecord[]): MediaAssetRecord[] {
  const starredAssetIds = readStarredAssetIds();
  return assets.map((asset) => ({
    ...asset,
    starred: starredAssetIds.has(asset.assetId)
  }));
}

function extractMediaRequestKey(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  const patterns = [
    /(?:amplify_video_thumb|amplify_video)\/(\d+)/,
    /(?:ext_tw_video_thumb|ext_tw_video)\/(\d+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function buildFallbackAssetId(candidate: MediaCandidate): string {
  const seed = [
    candidate.media.mediaKind,
    candidate.media.sourceUrl ?? "",
    candidate.media.previewUrl ?? "",
    candidate.media.posterUrl ?? "",
    candidate.filePath ?? "",
    candidate.usageId
  ].join("|");

  return `asset-${createHash("sha1").update(seed).digest("hex").slice(0, 16)}`;
}

function createUsageAnalysisFallback(candidate: MediaCandidate): UsageAnalysis {
  return {
    usageId: candidate.usageId,
    tweetId: candidate.tweet.tweetId,
    mediaIndex: candidate.mediaIndex,
    mediaKind: candidate.media.mediaKind,
    status: "pending",
    has_celebrity: null,
    has_human_face: null,
    features_female: null,
    features_male: null,
    has_screenshot_ui: null,
    has_text_overlay: null,
    has_chart_or_graph: null,
    has_logo_or_watermark: null,
    caption_brief: null,
    scene_description: null,
    ocr_text: null,
    primary_subjects: [],
    secondary_subjects: [],
    visible_objects: [],
    setting_context: null,
    action_or_event: null,
    video_music: null,
    video_sound: null,
    video_dialogue: null,
    video_action: null,
    primary_emotion: null,
    emotional_tone: null,
    conveys: null,
    user_intent: null,
    rhetorical_role: null,
    text_media_relationship: null,
    metaphor: null,
    humor_mechanism: null,
    cultural_reference: null,
    reference_entity: null,
    reference_source: null,
    reference_plot_context: null,
    analogy_target: null,
    analogy_scope: null,
    meme_format: null,
    persuasion_strategy: null,
    brand_signals: [],
    trend_signal: null,
    reuse_pattern: null,
    why_it_works: null,
    audience_takeaway: null,
    search_keywords: [],
    confidence_notes: null,
    usage_notes: null
  };
}

function mergeAnalysisValues(values: Array<string | null | undefined>): string | null {
  const unique = Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean)));
  if (unique.length === 0) {
    return null;
  }

  return unique.join(" | ");
}

function mergeAnalysisArrays(values: string[][]): string[] {
  return Array.from(new Set(values.flat().map((value) => value.trim()).filter(Boolean)));
}

export function summarizeAnalyses(assetId: string, analyses: UsageAnalysis[]): MediaAssetSummary {
  const completeAnalyses = analyses.filter((analysis) => analysis.status === "complete");
  const source = completeAnalyses[0] ?? analyses[0] ?? null;
  const now = new Date().toISOString();

  if (!source) {
    return {
      assetId,
      status: "fallback_first_analysis",
      sourceUsageId: null,
      usageCount: 0,
      completeAnalysisCount: 0,
      summary: null,
      createdAt: now,
      updatedAt: now
    };
  }

  if (completeAnalyses.length <= 1) {
    return {
      assetId,
      status: "fallback_first_analysis",
      sourceUsageId: source.usageId,
      usageCount: analyses.length,
      completeAnalysisCount: completeAnalyses.length,
      summary: source,
      createdAt: now,
      updatedAt: now
    };
  }

  const summary: UsageAnalysis = {
    ...source,
    usageId: `${assetId}::summary`,
    tweetId: null,
    mediaIndex: 0,
    status: "complete",
    has_celebrity: completeAnalyses.some((analysis) => analysis.has_celebrity === true),
    has_human_face: completeAnalyses.some((analysis) => analysis.has_human_face === true),
    features_female: completeAnalyses.some((analysis) => analysis.features_female === true),
    features_male: completeAnalyses.some((analysis) => analysis.features_male === true),
    has_screenshot_ui: completeAnalyses.some((analysis) => analysis.has_screenshot_ui === true),
    has_text_overlay: completeAnalyses.some((analysis) => analysis.has_text_overlay === true),
    has_chart_or_graph: completeAnalyses.some((analysis) => analysis.has_chart_or_graph === true),
    has_logo_or_watermark: completeAnalyses.some((analysis) => analysis.has_logo_or_watermark === true),
    caption_brief: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.caption_brief)),
    scene_description: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.scene_description)),
    ocr_text: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.ocr_text)),
    primary_subjects: mergeAnalysisArrays(completeAnalyses.map((analysis) => analysis.primary_subjects)),
    secondary_subjects: mergeAnalysisArrays(completeAnalyses.map((analysis) => analysis.secondary_subjects)),
    visible_objects: mergeAnalysisArrays(completeAnalyses.map((analysis) => analysis.visible_objects)),
    setting_context: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.setting_context)),
    action_or_event: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.action_or_event)),
    video_music: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.video_music)),
    video_sound: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.video_sound)),
    video_dialogue: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.video_dialogue)),
    video_action: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.video_action)),
    primary_emotion: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.primary_emotion)),
    emotional_tone: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.emotional_tone)),
    conveys: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.conveys)),
    user_intent: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.user_intent)),
    rhetorical_role: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.rhetorical_role)),
    text_media_relationship: mergeAnalysisValues(
      completeAnalyses.map((analysis) => analysis.text_media_relationship)
    ),
    metaphor: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.metaphor)),
    humor_mechanism: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.humor_mechanism)),
    cultural_reference: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.cultural_reference)),
    reference_entity: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.reference_entity)),
    reference_source: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.reference_source)),
    reference_plot_context: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.reference_plot_context)),
    analogy_target: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.analogy_target)),
    analogy_scope: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.analogy_scope)),
    meme_format: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.meme_format)),
    persuasion_strategy: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.persuasion_strategy)),
    brand_signals: mergeAnalysisArrays(completeAnalyses.map((analysis) => analysis.brand_signals)),
    trend_signal: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.trend_signal)),
    reuse_pattern: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.reuse_pattern)),
    why_it_works: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.why_it_works)),
    audience_takeaway: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.audience_takeaway)),
    search_keywords: mergeAnalysisArrays(completeAnalyses.map((analysis) => analysis.search_keywords)),
    confidence_notes: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.confidence_notes)),
    usage_notes: mergeAnalysisValues(completeAnalyses.map((analysis) => analysis.usage_notes))
  };

  return {
    assetId,
    status: "aggregated",
    sourceUsageId: source.usageId,
    usageCount: analyses.length,
    completeAnalysisCount: completeAnalyses.length,
    summary,
    createdAt: now,
    updatedAt: now
  };
}

function findLocalMediaFile(media: TweetMedia, manifests: CrawlManifest[]): string | null {
  const mediaUrl = normalizeMediaUrl(media);
  if (!mediaUrl) {
    return null;
  }

  for (const manifest of manifests) {
    for (const intercepted of manifest.interceptedMedia) {
      if (!intercepted.persisted || !intercepted.filePath) {
        continue;
      }

      if (intercepted.url === mediaUrl) {
        return path.join(projectRoot, intercepted.filePath);
      }
    }
  }

  return null;
}

function findRelatedSourceUrls(media: TweetMedia, manifests: CrawlManifest[]): string[] {
  const directUrls = [media.sourceUrl, media.previewUrl, media.posterUrl].filter(
    (value): value is string => Boolean(value)
  );
  const mediaRequestKey = extractMediaRequestKey(media.posterUrl ?? media.previewUrl ?? media.sourceUrl);

  const related = new Set<string>(directUrls);
  if (!mediaRequestKey) {
    return Array.from(related);
  }

  for (const manifest of manifests) {
    for (const intercepted of manifest.interceptedMedia) {
      if (intercepted.mediaClass !== "video") {
        continue;
      }

      if (extractMediaRequestKey(intercepted.url) === mediaRequestKey) {
        related.add(intercepted.url);
      }
    }
  }

  return Array.from(related);
}

function buildMediaCandidates(usages: TweetUsageRecord[], manifests: CrawlManifest[]): MediaCandidate[] {
  return usages.map((usage) => ({
    usageId: usage.usageId,
    tweet: usage.tweet,
    mediaIndex: usage.mediaIndex,
    media: usage.tweet.media[usage.mediaIndex],
    filePath: findLocalMediaFile(usage.tweet.media[usage.mediaIndex], manifests)
  }));
}

export function collectMediaUsageIdsFromTweets(tweets: ExtractedTweet[]): string[] {
  return tweets.flatMap((tweet) => tweet.media.map((_media, mediaIndex) => buildUsageId(tweet, mediaIndex)));
}

export function resolveMediaAssetSyncUsageIds(input: {
  usages: Array<Pick<TweetUsageRecord, "usageId">>;
  existingUsageToAssetId?: Record<string, string> | null;
  existingAssetIds?: Iterable<string>;
  requestedUsageIds?: string[] | null;
  forceFullRebuild?: boolean;
}): string[] {
  const usageIdsInOrder = input.usages.map((usage) => usage.usageId);
  const requestedUsageIds = input.requestedUsageIds?.filter(Boolean) ?? [];
  const hasExplicitRequestedUsageIds = input.requestedUsageIds != null;
  if (input.forceFullRebuild) {
    return requestedUsageIds.length > 0
      ? usageIdsInOrder.filter((usageId) => requestedUsageIds.includes(usageId))
      : usageIdsInOrder;
  }

  if (hasExplicitRequestedUsageIds) {
    const requestedSet = new Set(requestedUsageIds);
    return usageIdsInOrder.filter((usageId) => requestedSet.has(usageId));
  }

  const existingUsageToAssetId = input.existingUsageToAssetId ?? {};
  const existingAssetIds = new Set(input.existingAssetIds ?? []);
  return usageIdsInOrder.filter((usageId) => {
    const assetId = existingUsageToAssetId[usageId];
    return !assetId || !existingAssetIds.has(assetId);
  });
}

function buildUsageGroups(usages: TweetUsageRecord[]): Map<string, TweetUsageRecord[]> {
  const usageGroups = new Map<string, TweetUsageRecord[]>();

  for (const usage of usages) {
    if (!usage.mediaAssetId) {
      continue;
    }

    const current = usageGroups.get(usage.mediaAssetId) ?? [];
    current.push(usage);
    usageGroups.set(usage.mediaAssetId, current);
  }

  return usageGroups;
}

function computeAssetSimilarityMatch(input: {
  left: MediaAssetRecord;
  right: MediaAssetRecord;
  maxDistance: number;
  minSimilarity: number;
  includeAllNeighbors: boolean;
}): { distance: number | null; similarityScore: number } | null {
  const { left, right, maxDistance, minSimilarity, includeAllNeighbors } = input;

  let distance: number | null = null;
  let similarityScore = Number.NEGATIVE_INFINITY;

  const leftEmbedding = left.similarityEmbedding;
  const rightEmbedding = right.similarityEmbedding;
  if (
    leftEmbedding != null &&
    rightEmbedding != null &&
    leftEmbedding.values.length > 0 &&
    rightEmbedding.values.length > 0 &&
    leftEmbedding.model === rightEmbedding.model &&
    leftEmbedding.outputDimensionality === rightEmbedding.outputDimensionality
  ) {
    similarityScore = cosineSimilarity(leftEmbedding.values, rightEmbedding.values);
    if (!includeAllNeighbors && similarityScore < minSimilarity) {
      return null;
    }
  } else {
    if (!left.fingerprint?.hex || !right.fingerprint?.hex) {
      return null;
    }

    distance = hammingDistanceHex(left.fingerprint.hex, right.fingerprint.hex);
    if (!includeAllNeighbors && distance > maxDistance) {
      return null;
    }

    similarityScore = 1 - distance / 64;
  }

  return {
    distance,
    similarityScore
  };
}

export async function buildMediaAssetIndex(input: {
  usages: TweetUsageRecord[];
  manifests: CrawlManifest[];
}): Promise<MediaAssetIndexFile> {
  const result = await syncMediaAssetIndex({
    usages: input.usages,
    manifests: input.manifests,
    forceFullRebuild: true
  });

  return result.index;
}

export async function syncMediaAssetIndex(input: {
  usages: TweetUsageRecord[];
  manifests: CrawlManifest[];
  usageIds?: string[] | null;
  forceFullRebuild?: boolean;
}): Promise<MediaAssetIndexSyncResult> {
  const forceFullRebuild = input.forceFullRebuild === true;
  const existingIndex = forceFullRebuild ? null : readJsonFile<MediaAssetIndexFile>(assetIndexPath);
  const existingAssetsById = new Map((existingIndex?.assets ?? []).map((asset) => [asset.assetId, asset]));
  const usageIdsToProcess = resolveMediaAssetSyncUsageIds({
    usages: input.usages,
    existingUsageToAssetId: existingIndex?.usageToAssetId ?? null,
    existingAssetIds: existingAssetsById.keys(),
    requestedUsageIds: input.usageIds ?? null,
    forceFullRebuild
  });
  if (!forceFullRebuild && usageIdsToProcess.length === 0 && existingIndex) {
    return {
      index: readMediaAssetIndex() ?? {
        generatedAt: existingIndex.generatedAt,
        assets: hydrateAssetsWithStars(existingIndex.assets),
        usageToAssetId: { ...existingIndex.usageToAssetId }
      },
      processedUsageIds: [],
      touchedAssetIds: [],
      mode: "incremental"
    };
  }
  const usageIdsToProcessSet = new Set(usageIdsToProcess);
  const candidates = buildMediaCandidates(
    input.usages.filter((usage) => usageIdsToProcessSet.has(usage.usageId)),
    input.manifests
  );
  const assets: MediaAssetRecord[] = forceFullRebuild
    ? []
    : hydrateAssetsWithStars((existingIndex?.assets ?? []).map((asset) => ({
        ...asset,
        usageIds: [...asset.usageIds],
        sourceUrls: [...asset.sourceUrls],
        previewUrls: [...asset.previewUrls],
        posterUrls: [...asset.posterUrls]
      })));
  const usageToAssetId: Record<string, string> = forceFullRebuild
    ? {}
    : { ...(existingIndex?.usageToAssetId ?? {}) };
  const now = new Date().toISOString();
  const starredAssetIds = readStarredAssetIds();
  const touchedAssetIds = new Set<string>();

  for (const candidate of candidates) {
    const candidateUrls = collectCandidateMatchUrls(candidate, input.manifests);
    const candidateRequestKeys = Array.from(
      new Set(candidateUrls.map((url) => extractMediaRequestKey(url)).filter((value): value is string => Boolean(value)))
    );
    const fingerprint = candidate.filePath ? await computeDifferenceHash(candidate.filePath) : null;
    const matched =
      assets.find((asset) => assetMatchesCandidateByUrl(asset, candidateUrls, candidateRequestKeys)) ??
      assets.find((asset) => {
        if (!asset.fingerprint?.hex || !fingerprint?.hex) {
          return false;
        }

        return hammingDistanceHex(asset.fingerprint.hex, fingerprint.hex) <= EXACT_ASSET_MATCH_DISTANCE;
      });

    if (matched) {
      matched.updatedAt = now;
      matched.usageIds.push(candidate.usageId);
      for (const sourceUrl of candidateUrls) {
        matched.sourceUrls.push(sourceUrl);
      }
      if (candidate.media.previewUrl) matched.previewUrls.push(candidate.media.previewUrl);
      if (candidate.media.posterUrl) matched.posterUrls.push(candidate.media.posterUrl);
      if (!matched.canonicalMediaUrl) {
        matched.canonicalMediaUrl = normalizeMediaUrl(candidate.media);
      }
      if (!matched.canonicalFilePath && candidate.filePath) {
        matched.canonicalFilePath = path.relative(projectRoot, candidate.filePath);
      }
      usageToAssetId[candidate.usageId] = matched.assetId;
      touchedAssetIds.add(matched.assetId);
      continue;
    }

    const assetId = fingerprint?.hex
      ? `asset-${fingerprint.hex}`
      : buildFallbackAssetId(candidate);

    const record = mergeExistingMediaAssetState({
      assetId,
      canonicalMediaUrl: normalizeMediaUrl(candidate.media),
      canonicalFilePath: candidate.filePath ? path.relative(projectRoot, candidate.filePath) : null,
      promotedVideoSourceUrl: null,
      promotedVideoFilePath: null,
      mediaKind: candidate.media.mediaKind,
      fingerprint,
      similarityEmbedding: candidate.filePath ? await computeImageEmbedding(candidate.filePath) : null,
      starred: starredAssetIds.has(assetId),
      usageIds: [candidate.usageId],
      sourceUrls: findRelatedSourceUrls(candidate.media, input.manifests),
      previewUrls: candidate.media.previewUrl ? [candidate.media.previewUrl] : [],
      posterUrls: candidate.media.posterUrl ? [candidate.media.posterUrl] : [],
      createdAt: now,
      updatedAt: now
    }, existingAssetsById.get(assetId) ?? null);

    assets.push(record);
    usageToAssetId[candidate.usageId] = assetId;
    touchedAssetIds.add(assetId);
  }

  const dedupe = (values: string[]) => Array.from(new Set(values));
  for (const asset of assets) {
    asset.usageIds = dedupe(asset.usageIds);
    asset.sourceUrls = dedupe(asset.sourceUrls);
    asset.previewUrls = dedupe(asset.previewUrls);
    asset.posterUrls = dedupe(asset.posterUrls);
  }

  const usagesWithAssetIds = input.usages.map((usage) => ({
    ...usage,
    mediaAssetId: usageToAssetId[usage.usageId] ?? usage.mediaAssetId
  }));
  const duplicateGroupMap = buildDuplicateGroupMap({
    assets,
    usages: usagesWithAssetIds
  });
  const usageGroups = buildUsageGroups(usagesWithAssetIds);

  for (let assetIndex = 0; assetIndex < assets.length; assetIndex += 1) {
    const asset = assets[assetIndex];
    if (!forceFullRebuild && !touchedAssetIds.has(asset.assetId)) {
      continue;
    }

    const duplicateGroupUsageCount = asset.usageIds.reduce((max, usageId) => {
      const duplicateGroup = duplicateGroupMap[usageId];
      return Math.max(max, duplicateGroup?.usageIds.length ?? asset.usageIds.length);
    }, asset.usageIds.length);

    if (!shouldPromoteMediaAssetVideo(asset, duplicateGroupUsageCount)) {
      continue;
    }

    try {
      const promotedAsset = await promoteMediaAssetVideo(asset);
      assets[assetIndex] = promotedAsset;

      if (promotedAsset.promotedVideoFilePath) {
        const representativeUsage = (usageGroups.get(promotedAsset.assetId) ?? [])[0] ?? null;
        await analyzeMediaAssetVideo(promotedAsset, representativeUsage);
      }
    } catch (error) {
      console.warn(`Skipping promoted video processing for ${asset.assetId}. ${getErrorMessage(error)}`);
    }
  }

  const index: MediaAssetIndexFile = {
    generatedAt: now,
    assets: assets.sort((a, b) => a.assetId.localeCompare(b.assetId)),
    usageToAssetId
  };

  ensureDir(assetDir);
  writeJson(assetIndexPath, index);
  return {
    index,
    processedUsageIds: usageIdsToProcess,
    touchedAssetIds: Array.from(touchedAssetIds).sort(),
    mode: forceFullRebuild ? "full_rebuild" : "incremental"
  };
}

export function buildMediaAssetSummaries(input: {
  usages: TweetUsageRecord[];
  assetIndex: MediaAssetIndexFile;
}): MediaAssetSummaryFile {
  const result = syncMediaAssetSummaries({
    usages: input.usages,
    assetIndex: input.assetIndex,
    forceFullRebuild: true
  });

  return result.file;
}

export function syncMediaAssetSummaries(input: {
  usages: TweetUsageRecord[];
  assetIndex: MediaAssetIndexFile;
  assetIds?: string[] | null;
  forceFullRebuild?: boolean;
}): MediaAssetSummarySyncResult {
  const forceFullRebuild = input.forceFullRebuild === true;
  const analysisMap = new Map(readAllUsageAnalyses().map((analysis) => [analysis.usageId, analysis]));
  const assetVideoAnalysisMap = new Map(
    readAllAssetVideoAnalyses().map((analysis) => [analysis.usageId.replace("::video", ""), analysis])
  );
  const usageFallbackMap = new Map(
    input.usages.map((usage) => [usage.usageId, usage.analysis ?? createUsageAnalysisFallback({
      usageId: usage.usageId,
      tweet: usage.tweet,
      mediaIndex: usage.mediaIndex,
      media: usage.tweet.media[usage.mediaIndex],
      filePath: null
    })])
  );
  const existingSummaryFile = forceFullRebuild ? null : readJsonFile<MediaAssetSummaryFile>(assetSummaryPath);
  const existingSummaryMap = new Map((existingSummaryFile?.summaries ?? []).map((summary) => [summary.assetId, summary]));
  const requestedAssetIds = input.assetIds?.filter(Boolean) ?? [];
  const hasExplicitAssetIds = input.assetIds != null;
  const touchedAssetIdSet = new Set(
    forceFullRebuild
      ? input.assetIndex.assets.map((asset) => asset.assetId)
      : hasExplicitAssetIds
        ? requestedAssetIds
        : input.assetIndex.assets.map((asset) => asset.assetId)
  );
  if (!forceFullRebuild && touchedAssetIdSet.size === 0 && existingSummaryFile) {
    return {
      file: existingSummaryFile,
      touchedAssetIds: [],
      mode: "incremental"
    };
  }
  const summaries = input.assetIndex.assets.map((asset) => {
    if (!forceFullRebuild && !touchedAssetIdSet.has(asset.assetId)) {
      return existingSummaryMap.get(asset.assetId) ?? null;
    }

    const preferredVideoAnalysis = assetVideoAnalysisMap.get(asset.assetId) ?? null;
    const sourceAnalyses = preferredVideoAnalysis
      ? [preferredVideoAnalysis]
      : asset.usageIds.map((usageId) => analysisMap.get(usageId) ?? usageFallbackMap.get(usageId)).filter(Boolean);
    const summary = summarizeAnalyses(asset.assetId, sourceAnalyses as UsageAnalysis[]);

    return {
      ...summary,
      usageCount: asset.usageIds.length,
      completeAnalysisCount: preferredVideoAnalysis
        ? 1
        : sourceAnalyses.filter((analysis) => analysis?.status === "complete").length
    };
  }).filter((summary): summary is MediaAssetSummary => Boolean(summary));

  const file: MediaAssetSummaryFile = {
    generatedAt: new Date().toISOString(),
    summaries
  };

  ensureDir(assetDir);
  writeJson(assetSummaryPath, file);
  return {
    file,
    touchedAssetIds: Array.from(touchedAssetIdSet).sort(),
    mode: forceFullRebuild ? "full_rebuild" : "incremental"
  };
}

export function readMediaAssetIndex(): MediaAssetIndexFile | null {
  const file = readJsonFile<MediaAssetIndexFile>(assetIndexPath);
  if (!file) {
    return null;
  }

  return {
    ...file,
    assets: hydrateAssetsWithStars(file.assets)
  };
}

export function readMediaAssetSummaries(): MediaAssetSummaryFile | null {
  return readJsonFile<MediaAssetSummaryFile>(assetSummaryPath);
}

export function setMediaAssetStarred(assetId: string, starred: boolean): boolean {
  const index = readMediaAssetIndex();
  if (!index?.assets.some((asset) => asset.assetId === assetId)) {
    return false;
  }

  const starredAssetIds = readStarredAssetIds();
  if (starred) {
    starredAssetIds.add(assetId);
  } else {
    starredAssetIds.delete(assetId);
  }

  writeStarredAssetIds(starredAssetIds);
  return true;
}

export async function promoteStarredAssetVideo(assetId: string): Promise<MediaAssetRecord | null> {
  const index = readMediaAssetIndex();
  if (!index) {
    return null;
  }

  const assetIndex = index.assets.findIndex((asset) => asset.assetId === assetId);
  if (assetIndex === -1) {
    return null;
  }

  const asset = index.assets[assetIndex];
  if (!asset.starred || !["video", "video_hls", "video_blob"].includes(asset.mediaKind)) {
    return asset;
  }

  const promotedAsset = await promoteMediaAssetVideo(asset);
  if (promotedAsset.promotedVideoFilePath === asset.promotedVideoFilePath) {
    return promotedAsset;
  }

  const nextIndex: MediaAssetIndexFile = {
    ...index,
    generatedAt: new Date().toISOString(),
    assets: index.assets.map((currentAsset, currentIndex) =>
      currentIndex === assetIndex ? promotedAsset : currentAsset
    )
  };

  ensureDir(assetDir);
  writeJson(assetIndexPath, nextIndex);
  return promotedAsset;
}

export function buildPhashMatchMap(input: {
  assets: MediaAssetRecord[];
  usages: TweetUsageRecord[];
  maxDistance?: number;
  minSimilarity?: number;
}): Record<string, MediaAssetPhashMatch[]> {
  return buildAssetSimilarityMap({
    assets: input.assets,
    usages: input.usages,
    maxDistance: input.maxDistance,
    minSimilarity: input.minSimilarity,
    includeAllNeighbors: false
  });
}

function buildAssetSimilarityMap(input: {
  assets: MediaAssetRecord[];
  usages: TweetUsageRecord[];
  maxDistance?: number;
  minSimilarity?: number;
  includeAllNeighbors: boolean;
  limitPerAsset?: number;
}): Record<string, MediaAssetPhashMatch[]> {
  const maxDistance = input.maxDistance ?? DEFAULT_PHASH_MATCH_DISTANCE;
  const minSimilarity = input.minSimilarity ?? DEFAULT_MEDIA_MATCH_SIMILARITY;
  const usageGroups = buildUsageGroups(input.usages);

  const matchMap: Record<string, MediaAssetPhashMatch[]> = Object.fromEntries(
    input.assets.map((asset) => [asset.assetId, []])
  );

  for (let index = 0; index < input.assets.length; index += 1) {
    const left = input.assets[index];
    if (!left.fingerprint?.hex && !left.similarityEmbedding?.values?.length) {
      continue;
    }

    for (let compareIndex = index + 1; compareIndex < input.assets.length; compareIndex += 1) {
      const right = input.assets[compareIndex];
      if (!right.fingerprint?.hex && !right.similarityEmbedding?.values?.length) {
        continue;
      }

      const match = computeAssetSimilarityMatch({
        left,
        right,
        maxDistance,
        minSimilarity,
        includeAllNeighbors: input.includeAllNeighbors
      });
      if (!match) {
        continue;
      }

      matchMap[left.assetId].push({
        asset: right,
        distance: match.distance,
        similarityScore: match.similarityScore,
        usages: usageGroups.get(right.assetId) ?? []
      });
      matchMap[right.assetId].push({
        asset: left,
        distance: match.distance,
        similarityScore: match.similarityScore,
        usages: usageGroups.get(left.assetId) ?? []
      });
    }
  }

  for (const assetId of Object.keys(matchMap)) {
    matchMap[assetId].sort((left, right) => {
      if (left.similarityScore !== right.similarityScore) {
        return right.similarityScore - left.similarityScore;
      }

      if ((left.distance ?? Number.MAX_SAFE_INTEGER) !== (right.distance ?? Number.MAX_SAFE_INTEGER)) {
        return (left.distance ?? Number.MAX_SAFE_INTEGER) - (right.distance ?? Number.MAX_SAFE_INTEGER);
      }

      return right.usages.length - left.usages.length;
    });

    if (input.limitPerAsset && input.limitPerAsset > 0) {
      matchMap[assetId] = matchMap[assetId].slice(0, input.limitPerAsset);
    }
  }

  return matchMap;
}

function buildAssetSimilarityMatchesForAsset(input: {
  targetAssetId: string;
  assets: MediaAssetRecord[];
  usages: TweetUsageRecord[];
  maxDistance?: number;
  minSimilarity?: number;
  includeAllNeighbors: boolean;
  limit?: number;
}): MediaAssetPhashMatch[] {
  const maxDistance = input.maxDistance ?? DEFAULT_PHASH_MATCH_DISTANCE;
  const minSimilarity = input.minSimilarity ?? DEFAULT_MEDIA_MATCH_SIMILARITY;
  const usageGroups = buildUsageGroups(input.usages);
  const target = input.assets.find((asset) => asset.assetId === input.targetAssetId);

  if (!target || (!target.fingerprint?.hex && !target.similarityEmbedding?.values?.length)) {
    return [];
  }

  const matches: MediaAssetPhashMatch[] = [];
  for (const asset of input.assets) {
    if (asset.assetId === target.assetId) {
      continue;
    }

    if (!asset.fingerprint?.hex && !asset.similarityEmbedding?.values?.length) {
      continue;
    }

    const match = computeAssetSimilarityMatch({
      left: target,
      right: asset,
      maxDistance,
      minSimilarity,
      includeAllNeighbors: input.includeAllNeighbors
    });
    if (!match) {
      continue;
    }

    matches.push({
      asset,
      distance: match.distance,
      similarityScore: match.similarityScore,
      usages: usageGroups.get(asset.assetId) ?? []
    });
  }

  matches.sort((left, right) => {
    if (left.similarityScore !== right.similarityScore) {
      return right.similarityScore - left.similarityScore;
    }

    if ((left.distance ?? Number.MAX_SAFE_INTEGER) !== (right.distance ?? Number.MAX_SAFE_INTEGER)) {
      return (left.distance ?? Number.MAX_SAFE_INTEGER) - (right.distance ?? Number.MAX_SAFE_INTEGER);
    }

    return right.usages.length - left.usages.length;
  });

  if (input.limit && input.limit > 0) {
    return matches.slice(0, input.limit);
  }

  return matches;
}

function buildNearestNeighborMap(input: {
  assets: MediaAssetRecord[];
  usages: TweetUsageRecord[];
  limit?: number;
}): Record<string, MediaAssetPhashMatch[]> {
  return buildAssetSimilarityMap({
    assets: input.assets,
    usages: input.usages,
    includeAllNeighbors: true,
    limitPerAsset: input.limit ?? 10
  });
}

export function buildDuplicateGroupMap(input: {
  assets: MediaAssetRecord[];
  usages: TweetUsageRecord[];
  phashMatchMap?: Record<string, MediaAssetPhashMatch[]>;
}): Record<string, { groupId: string; usageIds: string[] }> {
  const phashMatchMap =
    input.phashMatchMap ??
    buildPhashMatchMap({
      assets: input.assets,
      usages: input.usages
    });
  const usageGroups = new Map<string, string[]>();

  for (const usage of input.usages) {
    if (!usage.mediaAssetId) {
      continue;
    }

    const current = usageGroups.get(usage.mediaAssetId) ?? [];
    current.push(usage.usageId);
    usageGroups.set(usage.mediaAssetId, current);
  }

  const visited = new Set<string>();
  const duplicateGroupMap: Record<string, { groupId: string; usageIds: string[] }> = {};

  for (const asset of input.assets) {
    if (visited.has(asset.assetId)) {
      continue;
    }

    const queue = [asset.assetId];
    const component = new Set<string>();

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId || visited.has(currentId)) {
        continue;
      }

      visited.add(currentId);
      component.add(currentId);

      for (const match of phashMatchMap[currentId] ?? []) {
        if (!visited.has(match.asset.assetId)) {
          queue.push(match.asset.assetId);
        }
      }
    }

    const groupUsageIds = Array.from(component)
      .flatMap((assetId) => usageGroups.get(assetId) ?? [])
      .sort();
    const groupId = Array.from(component).sort().join("__");

    for (const usageId of groupUsageIds) {
      duplicateGroupMap[usageId] = {
        groupId,
        usageIds: groupUsageIds
      };
    }
  }

  return duplicateGroupMap;
}

export function getMediaAssetView(input: {
  usageId: string;
  usages: TweetUsageRecord[];
}): MediaAssetView | null {
  const index = readMediaAssetIndex();
  if (!index) {
    return null;
  }

  const assetId = index.usageToAssetId[input.usageId];
  if (!assetId) {
    return null;
  }

  const asset = index.assets.find((item) => item.assetId === assetId);
  if (!asset) {
    return null;
  }

  const summaries = readMediaAssetSummaries();
  const phashMatches = buildAssetSimilarityMatchesForAsset({
    targetAssetId: assetId,
    assets: index.assets,
    usages: input.usages,
    includeAllNeighbors: false
  });
  const nearestNeighbors = buildAssetSimilarityMatchesForAsset({
    targetAssetId: assetId,
    assets: index.assets,
    usages: input.usages,
    includeAllNeighbors: true,
    limit: 10
  });

  return {
    asset,
    summary: summaries?.summaries.find((item) => item.assetId === assetId) ?? null,
    duplicateUsages: input.usages.filter((usage) => asset.usageIds.includes(usage.usageId)),
    phashMatches,
    nearestNeighbors
  };
}

export function getPhashMatchClusters(input: { usages: TweetUsageRecord[] }): Array<{
  clusterId: string;
  items: Array<{
    asset: MediaAssetRecord;
    previewUrl: string | null;
    usageCount: number;
    representativeUsageId: string | null;
    representativeTweetText: string | null;
    representativeAuthorUsername: string | null;
    phashMatchCount: number;
  }>;
}> {
  const index = readMediaAssetIndex();
  if (!index) {
    return [];
  }

  const usageGroups = new Map<string, TweetUsageRecord[]>();
  for (const usage of input.usages) {
    if (!usage.mediaAssetId) {
      continue;
    }

    const current = usageGroups.get(usage.mediaAssetId) ?? [];
    current.push(usage);
    usageGroups.set(usage.mediaAssetId, current);
  }

  const phashMatchMap = buildPhashMatchMap({
    assets: index.assets,
    usages: input.usages
  });
  const visited = new Set<string>();
  const clusters: Array<{
    clusterId: string;
    items: Array<{
      asset: MediaAssetRecord;
      previewUrl: string | null;
      usageCount: number;
      representativeUsageId: string | null;
      representativeTweetText: string | null;
      representativeAuthorUsername: string | null;
      phashMatchCount: number;
    }>;
  }> = [];

  for (const asset of index.assets) {
    if (visited.has(asset.assetId) || (phashMatchMap[asset.assetId]?.length ?? 0) === 0) {
      continue;
    }

    const queue = [asset.assetId];
    const component = new Set<string>();

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId || visited.has(currentId)) {
        continue;
      }

      visited.add(currentId);
      component.add(currentId);

      for (const match of phashMatchMap[currentId] ?? []) {
        if (!visited.has(match.asset.assetId)) {
          queue.push(match.asset.assetId);
        }
      }
    }

    if (component.size < 2) {
      continue;
    }

    const items = Array.from(component)
      .map((assetId) => index.assets.find((item) => item.assetId === assetId))
      .filter((item): item is MediaAssetRecord => Boolean(item))
      .map((item) => {
        const usages = usageGroups.get(item.assetId) ?? [];
        const representative = usages[0] ?? null;

        return {
          asset: item,
          previewUrl: item.posterUrls[0] ?? item.previewUrls[0] ?? item.canonicalMediaUrl,
          usageCount: item.usageIds.length,
          representativeUsageId: representative?.usageId ?? null,
          representativeTweetText: representative?.tweet.text ?? null,
          representativeAuthorUsername: representative?.tweet.authorUsername ?? null,
          phashMatchCount: phashMatchMap[item.assetId]?.length ?? 0
        };
      })
      .sort((left, right) => {
        if (right.phashMatchCount !== left.phashMatchCount) {
          return right.phashMatchCount - left.phashMatchCount;
        }

        return right.usageCount - left.usageCount;
      });

    clusters.push({
      clusterId: Array.from(component).sort().join("__"),
      items
    });
  }

  return clusters.sort((left, right) => right.items.length - left.items.length);
}
