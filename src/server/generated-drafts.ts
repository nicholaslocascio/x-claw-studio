import fs from "node:fs";
import path from "node:path";
import { resolveMediaDisplayUrl } from "@/src/lib/media-display";
import { slugify, writeJson } from "@/src/lib/fs";
import type {
  GeneratedDraftKind,
  GeneratedDraftMediaCandidateRecord,
  GeneratedDraftOutputRecord,
  GeneratedDraftRecord,
  GeneratedDraftStatus
} from "@/src/lib/generated-drafts";
import type { MediaPostResult } from "@/src/lib/media-post-composer";
import type { ReplyCompositionBatchResult, ReplyCompositionResult } from "@/src/lib/reply-composer";
import type { ExtractedTweet, MediaAssetRecord, MediaAssetSummary, TopicClusterRecord, TweetUsageRecord } from "@/src/lib/types";
import type { TopicPostBatchResult, TopicPostResult } from "@/src/lib/topic-composer";
import { getDashboardData } from "@/src/server/data";
import { readMediaAssetIndex, readMediaAssetSummaries } from "@/src/server/media-assets";

const projectRoot = process.cwd();
const generatedDraftsPath = path.join(projectRoot, "data", "analysis", "generated-drafts", "index.json");

export interface GeneratedDraftViewRecord extends GeneratedDraftRecord {
  sourceTweet: ExtractedTweet | null;
  sourceUsage: TweetUsageRecord | null;
  sourceAsset: MediaAssetRecord | null;
  sourceAssetSummary: MediaAssetSummary | null;
  sourceAssetDisplayUrl: string | null;
  sourceAssetVideoFilePath: string | null;
  topic: TopicClusterRecord | null;
}

function readDrafts(): GeneratedDraftRecord[] {
  if (!fs.existsSync(generatedDraftsPath)) {
    return [];
  }

  return JSON.parse(fs.readFileSync(generatedDraftsPath, "utf8")) as GeneratedDraftRecord[];
}

function writeDrafts(records: GeneratedDraftRecord[]): void {
  writeJson(generatedDraftsPath, records);
}

function buildDraftId(kind: GeneratedDraftKind, seed: string): string {
  return `${kind}-${slugify(seed) || "draft"}-${Date.now()}`;
}

export function listGeneratedDrafts(filter?: {
  kind?: GeneratedDraftKind;
  usageId?: string | null;
  tweetId?: string | null;
  topicId?: string | null;
  limit?: number;
}): GeneratedDraftRecord[] {
  const records = readDrafts().filter((record) => {
    if (filter?.kind && record.kind !== filter.kind) {
      return false;
    }
    if (filter?.usageId && record.usageId !== filter.usageId) {
      return false;
    }
    if (filter?.tweetId && record.tweetId !== filter.tweetId) {
      return false;
    }
    if (filter?.topicId && record.topicId !== filter.topicId) {
      return false;
    }
    return true;
  });

  return records.slice(0, filter?.limit ?? 50);
}

export function createGeneratedDraft(input: {
  kind: GeneratedDraftKind;
  usageId?: string | null;
  tweetId?: string | null;
  topicId?: string | null;
  assetId?: string | null;
  requestGoal?: string | null;
  requestMode?: string | null;
  progressStage?: string | null;
  progressMessage?: string | null;
  progressDetail?: string | null;
}): GeneratedDraftRecord {
  const now = new Date().toISOString();
  const record: GeneratedDraftRecord = {
    draftId: buildDraftId(input.kind, input.usageId ?? input.topicId ?? input.tweetId ?? input.assetId ?? now),
    kind: input.kind,
    status: "running",
    createdAt: now,
    updatedAt: now,
    usageId: input.usageId ?? null,
    tweetId: input.tweetId ?? null,
    topicId: input.topicId ?? null,
    assetId: input.assetId ?? null,
    requestGoal: input.requestGoal ?? null,
    requestMode: input.requestMode ?? null,
    progressStage: input.progressStage ?? null,
    progressMessage: input.progressMessage ?? null,
    progressDetail: input.progressDetail ?? null,
    errorMessage: null,
    outputs: []
  };

  const current = readDrafts();
  writeDrafts([record, ...current]);
  return record;
}

export function updateGeneratedDraft(
  draftId: string,
  update: Partial<Pick<GeneratedDraftRecord, "status" | "progressStage" | "progressMessage" | "progressDetail" | "errorMessage" | "outputs">>
): GeneratedDraftRecord | null {
  const current = readDrafts();
  const index = current.findIndex((record) => record.draftId === draftId);
  if (index === -1) {
    return null;
  }

  current[index] = {
    ...current[index],
    ...update,
    status: (update.status ?? current[index].status) as GeneratedDraftStatus,
    updatedAt: new Date().toISOString()
  };
  writeDrafts(current);
  return current[index];
}

function buildReplyOutputs(result: ReplyCompositionResult | ReplyCompositionBatchResult): GeneratedDraftOutputRecord[] {
  const items = "results" in result ? result.results : [result];
  return items.map((item) => ({
    goal: item.request.goal,
    text: item.reply.text,
    whyThisWorks: item.reply.whyThisReplyWorks,
    mediaSelectionReason: item.reply.mediaSelectionReason,
    postingNotes: item.reply.postingNotes,
    selectedMediaLabel: item.selectedMedia?.sourceLabel ?? item.selectedMedia?.tweetText ?? null,
    selectedMediaSourceType: item.selectedMedia?.sourceType ?? null,
    selectedMediaCandidateId: item.selectedMedia?.candidateId ?? null,
    selectedMediaUsageId: item.selectedMedia?.usageId ?? null,
    selectedMediaAssetId: item.selectedMedia?.assetId ?? null,
    selectedMediaTweetId: item.selectedMedia?.tweetId ?? null,
    selectedMediaTweetUrl: item.selectedMedia?.tweetUrl ?? null,
    selectedMediaDisplayUrl: item.selectedMedia?.displayUrl ?? null,
    selectedMediaLocalFilePath: item.selectedMedia?.localFilePath ?? null,
    selectedMediaVideoFilePath: item.selectedMedia?.videoFilePath ?? null,
    alternativeMedia: item.alternativeMedia.map((candidate) => buildDraftMediaCandidate(candidate)),
    postedToXAt: null,
    postedToXUrl: null,
    postedToXError: null,
    typefullySavedAt: null,
    typefullyDraftId: null,
    typefullyStatus: null,
    typefullyPrivateUrl: null,
    typefullyShareUrl: null,
    typefullyError: null
  }));
}

function buildTopicOutputs(result: TopicPostResult | TopicPostBatchResult): GeneratedDraftOutputRecord[] {
  const items = "results" in result ? result.results : [result];
  return items.map((item) => ({
    goal: item.request.goal,
    text: item.tweet.text,
    whyThisWorks: item.tweet.whyThisTweetWorks,
    mediaSelectionReason: item.tweet.mediaSelectionReason,
    postingNotes: item.tweet.postingNotes,
    selectedMediaLabel: item.selectedMedia?.sourceLabel ?? item.selectedMedia?.tweetText ?? null,
    selectedMediaSourceType: item.selectedMedia?.sourceType ?? null,
    selectedMediaCandidateId: item.selectedMedia?.candidateId ?? null,
    selectedMediaUsageId: item.selectedMedia?.usageId ?? null,
    selectedMediaAssetId: item.selectedMedia?.assetId ?? null,
    selectedMediaTweetId: item.selectedMedia?.tweetId ?? null,
    selectedMediaTweetUrl: item.selectedMedia?.tweetUrl ?? null,
    selectedMediaDisplayUrl: item.selectedMedia?.displayUrl ?? null,
    selectedMediaLocalFilePath: item.selectedMedia?.localFilePath ?? null,
    selectedMediaVideoFilePath: item.selectedMedia?.videoFilePath ?? null,
    postedToXAt: null,
    postedToXUrl: null,
    postedToXError: null,
    typefullySavedAt: null,
    typefullyDraftId: null,
    typefullyStatus: null,
    typefullyPrivateUrl: null,
    typefullyShareUrl: null,
    typefullyError: null
  }));
}

function buildMediaOutputs(result: MediaPostResult): GeneratedDraftOutputRecord[] {
  const selectedMediaLocalFilePath = result.selectedMedia?.localFilePath ?? result.subject.localFilePath ?? null;
  const selectedMediaVideoFilePath = result.selectedMedia?.videoFilePath ?? result.subject.playableFilePath ?? null;

  return [
    {
      goal: null,
      text: result.tweet.text,
      whyThisWorks: result.tweet.whyThisTweetWorks,
      mediaSelectionReason: result.tweet.mediaSelectionReason,
      postingNotes: result.tweet.postingNotes,
      selectedMediaLabel: result.selectedMedia?.sourceLabel ?? result.selectedMedia?.tweetText ?? null,
      selectedMediaSourceType: result.selectedMedia?.sourceType ?? null,
      selectedMediaCandidateId: result.selectedMedia?.candidateId ?? null,
      selectedMediaUsageId: result.selectedMedia?.usageId ?? null,
      selectedMediaAssetId: result.selectedMedia?.assetId ?? result.subject.assetId ?? null,
      selectedMediaTweetId: result.selectedMedia?.tweetId ?? null,
      selectedMediaTweetUrl: result.selectedMedia?.tweetUrl ?? null,
      selectedMediaDisplayUrl: result.selectedMedia?.displayUrl ?? null,
      selectedMediaLocalFilePath,
      selectedMediaVideoFilePath,
      postedToXAt: null,
      postedToXUrl: null,
      postedToXError: null,
      typefullySavedAt: null,
      typefullyDraftId: null,
      typefullyStatus: null,
      typefullyPrivateUrl: null,
      typefullyShareUrl: null,
      typefullyError: null
    }
  ];
}

function buildDraftMediaCandidate(candidate: ReplyCompositionResult["alternativeMedia"][number]): GeneratedDraftMediaCandidateRecord {
  return {
    candidateId: candidate.candidateId,
    usageId: candidate.usageId,
    assetId: candidate.assetId,
    tweetId: candidate.tweetId,
    tweetUrl: candidate.tweetUrl,
    authorUsername: candidate.authorUsername,
    tweetText: candidate.tweetText,
    displayUrl: candidate.displayUrl,
    localFilePath: candidate.localFilePath,
    videoFilePath: candidate.videoFilePath,
    sourceType: candidate.sourceType,
    sourceLabel: candidate.sourceLabel,
    combinedScore: candidate.combinedScore,
    sceneDescription: candidate.analysis?.sceneDescription ?? null,
    primaryEmotion: candidate.analysis?.primaryEmotion ?? null,
    conveys: candidate.analysis?.conveys ?? null
  };
}

function pickSourceUsage(record: GeneratedDraftRecord, usageMap: Map<string, TweetUsageRecord>, tweetUsageMap: Map<string, TweetUsageRecord[]>): TweetUsageRecord | null {
  if (record.usageId) {
    return usageMap.get(record.usageId) ?? null;
  }

  if (!record.tweetId) {
    return null;
  }

  return (tweetUsageMap.get(record.tweetId) ?? [])[0] ?? null;
}

export function listGeneratedDraftViews(filter?: {
  kind?: GeneratedDraftKind;
  usageId?: string | null;
  tweetId?: string | null;
  topicId?: string | null;
  limit?: number;
}): GeneratedDraftViewRecord[] {
  const drafts = listGeneratedDrafts(filter);
  const dashboard = getDashboardData();
  const assetIndex = readMediaAssetIndex();
  const assetSummaryFile = readMediaAssetSummaries();
  const usageMap = new Map(dashboard.tweetUsages.map((usage) => [usage.usageId, usage]));
  const tweetMap = new Map(dashboard.capturedTweets.map((entry) => [entry.tweet.tweetId ?? entry.tweetKey, entry.tweet]));
  const tweetUsageMap = new Map<string, TweetUsageRecord[]>();
  const assetMap = new Map((assetIndex?.assets ?? []).map((asset) => [asset.assetId, asset]));
  const assetSummaryMap = new Map((assetSummaryFile?.summaries ?? []).map((summary) => [summary.assetId, summary]));
  const topicMap = new Map(dashboard.topicClusters.map((topic) => [topic.topicId, topic]));

  for (const usage of dashboard.tweetUsages) {
    if (!usage.tweet.tweetId) {
      continue;
    }

    const current = tweetUsageMap.get(usage.tweet.tweetId) ?? [];
    current.push(usage);
    tweetUsageMap.set(usage.tweet.tweetId, current);
  }

  return drafts.map((draft) => {
    const sourceUsage = pickSourceUsage(draft, usageMap, tweetUsageMap);
    const sourceTweet = sourceUsage?.tweet ?? (draft.tweetId ? tweetMap.get(draft.tweetId) ?? null : null);
    const sourceAssetId = draft.assetId ?? sourceUsage?.mediaAssetId ?? null;
    const sourceAsset = sourceAssetId ? assetMap.get(sourceAssetId) ?? null : null;

    return {
      ...draft,
      sourceTweet,
      sourceUsage,
      sourceAsset,
      sourceAssetSummary: sourceAssetId ? assetSummaryMap.get(sourceAssetId) ?? null : null,
      sourceAssetDisplayUrl: sourceUsage
        ? resolveMediaDisplayUrl({
            localFilePath: sourceUsage.mediaLocalFilePath,
            posterUrl: sourceUsage.tweet.media[sourceUsage.mediaIndex]?.posterUrl,
            previewUrl: sourceUsage.tweet.media[sourceUsage.mediaIndex]?.previewUrl,
            sourceUrl: sourceUsage.tweet.media[sourceUsage.mediaIndex]?.sourceUrl
          })
        : sourceAsset
          ? resolveMediaDisplayUrl({
              localFilePath: sourceAsset.canonicalFilePath,
              posterUrl: sourceAsset.posterUrls[0],
              previewUrl: sourceAsset.previewUrls[0],
              sourceUrl: sourceAsset.canonicalMediaUrl
            })
          : null,
      sourceAssetVideoFilePath: sourceUsage?.mediaPlayableFilePath ?? sourceAsset?.promotedVideoFilePath ?? null,
      topic: draft.topicId ? topicMap.get(draft.topicId) ?? null : null
    };
  });
}

export function markGeneratedDraftComplete(input: {
  draftId: string;
  kind: GeneratedDraftKind;
  result: ReplyCompositionResult | ReplyCompositionBatchResult | TopicPostResult | TopicPostBatchResult | MediaPostResult;
}): GeneratedDraftRecord | null {
  const outputs =
    input.kind === "reply"
      ? buildReplyOutputs(input.result as ReplyCompositionResult | ReplyCompositionBatchResult)
      : input.kind === "topic_post"
        ? buildTopicOutputs(input.result as TopicPostResult | TopicPostBatchResult)
        : buildMediaOutputs(input.result as MediaPostResult);

  return updateGeneratedDraft(input.draftId, {
    status: "complete",
    outputs,
    errorMessage: null
  });
}

export function markGeneratedDraftOutputPosted(input: {
  draftId: string;
  outputIndex: number;
  postedAt: string;
  postedToXUrl?: string | null;
}): GeneratedDraftRecord | null {
  const current = readDrafts();
  const draftIndex = current.findIndex((record) => record.draftId === input.draftId);
  if (draftIndex === -1) {
    return null;
  }

  const outputs = current[draftIndex].outputs.map((output, index) =>
    index === input.outputIndex
      ? {
          ...output,
          postedToXAt: input.postedAt,
          postedToXUrl: input.postedToXUrl ?? null,
          postedToXError: null
        }
      : output
  );

  current[draftIndex] = {
    ...current[draftIndex],
    outputs,
    updatedAt: new Date().toISOString()
  };
  writeDrafts(current);
  return current[draftIndex];
}

export function markGeneratedDraftOutputPostFailed(input: {
  draftId: string;
  outputIndex: number;
  errorMessage: string;
}): GeneratedDraftRecord | null {
  const current = readDrafts();
  const draftIndex = current.findIndex((record) => record.draftId === input.draftId);
  if (draftIndex === -1) {
    return null;
  }

  const outputs = current[draftIndex].outputs.map((output, index) =>
    index === input.outputIndex
      ? {
          ...output,
          postedToXError: input.errorMessage
        }
      : output
  );

  current[draftIndex] = {
    ...current[draftIndex],
    outputs,
    updatedAt: new Date().toISOString()
  };
  writeDrafts(current);
  return current[draftIndex];
}

export function markGeneratedDraftOutputSavedToTypefully(input: {
  draftId: string;
  outputIndex: number;
  savedAt: string;
  typefullyDraftId: number;
  typefullyStatus: string;
  typefullyPrivateUrl?: string | null;
  typefullyShareUrl?: string | null;
}): GeneratedDraftRecord | null {
  const current = readDrafts();
  const draftIndex = current.findIndex((record) => record.draftId === input.draftId);
  if (draftIndex === -1) {
    return null;
  }

  const outputs = current[draftIndex].outputs.map((output, index) =>
    index === input.outputIndex
      ? {
          ...output,
          typefullySavedAt: input.savedAt,
          typefullyDraftId: input.typefullyDraftId,
          typefullyStatus: input.typefullyStatus,
          typefullyPrivateUrl: input.typefullyPrivateUrl ?? null,
          typefullyShareUrl: input.typefullyShareUrl ?? null,
          typefullyError: null
        }
      : output
  );

  current[draftIndex] = {
    ...current[draftIndex],
    outputs,
    updatedAt: new Date().toISOString()
  };
  writeDrafts(current);
  return current[draftIndex];
}

export function markGeneratedDraftOutputTypefullyFailed(input: {
  draftId: string;
  outputIndex: number;
  errorMessage: string;
}): GeneratedDraftRecord | null {
  const current = readDrafts();
  const draftIndex = current.findIndex((record) => record.draftId === input.draftId);
  if (draftIndex === -1) {
    return null;
  }

  const outputs = current[draftIndex].outputs.map((output, index) =>
    index === input.outputIndex
      ? {
          ...output,
          typefullyError: input.errorMessage
        }
      : output
  );

  current[draftIndex] = {
    ...current[draftIndex],
    outputs,
    updatedAt: new Date().toISOString()
  };
  writeDrafts(current);
  return current[draftIndex];
}
