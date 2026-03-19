import type { MediaPostProgressEvent, MediaPostRequest, MediaPostResult, MediaPostSubject } from "@/src/lib/media-post-composer";
import type { ReplyMediaCandidate } from "@/src/lib/reply-composer";
import { resolveMediaDisplayUrl } from "@/src/lib/media-display";
import { getUsageDetail } from "@/src/server/usage-details";
import { createMediaPostComposerModel } from "@/src/server/media-post-composer-model";
import { CliFacetReplyMediaSearchProvider } from "@/src/server/reply-media-search";
import { getCurrentComposeRunLog } from "@/src/server/compose-run-log";
import { recordAssetWishlist } from "@/src/server/reply-media-wishlist";
import { createPerfTrace } from "@/src/server/perf-log";

async function buildMediaPostSubject(usageId: string): Promise<MediaPostSubject> {
  const detail = await getUsageDetail(usageId);
  if (!detail) {
    throw new Error(`Usage ${usageId} was not found`);
  }

  return {
    usageId: detail.usageId,
    tweetId: detail.tweet.tweetId,
    assetId: detail.mediaAssetId,
    assetUsageCount: detail.mediaAssetUsageCount,
    mediaKind: detail.analysis.mediaKind,
    authorUsername: detail.tweet.authorUsername,
    createdAt: detail.tweet.createdAt,
    tweetText: detail.tweet.text,
    localFilePath: detail.mediaAssetView?.asset.canonicalFilePath ?? detail.mediaLocalFilePath,
    playableFilePath: detail.mediaAssetView?.asset.promotedVideoFilePath ?? detail.mediaPlayableFilePath,
    analysis: {
      captionBrief: detail.analysis.caption_brief,
      sceneDescription: detail.analysis.scene_description,
      primaryEmotion: detail.analysis.primary_emotion,
      emotionalTone: detail.analysis.emotional_tone,
      conveys: detail.analysis.conveys,
      userIntent: detail.analysis.user_intent,
      rhetoricalRole: detail.analysis.rhetorical_role,
      textMediaRelationship: detail.analysis.text_media_relationship,
      culturalReference: detail.analysis.cultural_reference,
      analogyTarget: detail.analysis.analogy_target,
      trendSignal: detail.analysis.trend_signal,
      audienceTakeaway: detail.analysis.audience_takeaway,
      brandSignals: detail.analysis.brand_signals,
      searchKeywords: detail.analysis.search_keywords
    },
    relatedTopics: detail.relevantTopics.slice(0, 4).map((topic) => ({
      label: topic.topic.label ?? topic.analysis.summaryLabel ?? "Untitled topic",
      hotnessScore: topic.topic.hotnessScore,
      stance: topic.analysis.stance,
      sentiment: topic.analysis.sentiment,
      whyNow: topic.analysis.whyNow
    })),
    priorUsages: (detail.mediaAssetView?.duplicateUsages ?? [])
      .filter((usage) => usage.usageId !== detail.usageId)
      .slice(0, 4)
      .map((usage) => ({
        authorUsername: usage.tweet.authorUsername,
        createdAt: usage.tweet.createdAt,
        tweetText: usage.tweet.text
      }))
  };
}

function buildCurrentAssetCandidate(subject: MediaPostSubject): ReplyMediaCandidate {
  return {
    candidateId: `current-asset::${subject.assetId ?? subject.usageId}`,
    usageId: subject.usageId,
    assetId: subject.assetId,
    tweetId: subject.tweetId,
    tweetUrl: null,
    authorUsername: subject.authorUsername,
    createdAt: subject.createdAt,
    tweetText: subject.tweetText,
    displayUrl: resolveMediaDisplayUrl({
      localFilePath: subject.localFilePath
    }),
    localFilePath: subject.localFilePath,
    videoFilePath: subject.playableFilePath,
    mediaKind: subject.mediaKind,
    combinedScore: 1,
    rankingScore: 1,
    assetStarred: false,
    assetUsageCount: subject.priorUsages.length + 1,
    duplicateGroupUsageCount: subject.priorUsages.length + 1,
    hotnessScore: null,
    matchReason: "current media asset",
    sourceType: "usage_facet",
    sourceLabel: subject.tweetText,
    analysis: {
      captionBrief: subject.analysis.captionBrief,
      sceneDescription: subject.analysis.sceneDescription,
      primaryEmotion: subject.analysis.primaryEmotion,
      conveys: subject.analysis.conveys,
      rhetoricalRole: subject.analysis.rhetoricalRole,
      culturalReference: subject.analysis.culturalReference,
      analogyTarget: subject.analysis.analogyTarget,
      searchKeywords: subject.analysis.searchKeywords
    }
  };
}

export async function composeTweetFromMediaAsset(
  request: MediaPostRequest,
  options?: {
    onProgress?: (event: MediaPostProgressEvent) => void;
  }
): Promise<MediaPostResult> {
  const perf = createPerfTrace("compose:media-post", {
    usageId: request.usageId
  });
  options?.onProgress?.({
    stage: "starting",
    message: "Loading media asset context",
    detail: request.usageId
  });

  const subject = await buildMediaPostSubject(request.usageId);
  perf.mark("subject_ready", {
    assetId: subject.assetId ?? null,
    priorUsageCount: subject.priorUsages.length
  });
  const model = createMediaPostComposerModel();
  const search = new CliFacetReplyMediaSearchProvider({ scope: "media-post" });
  const logger = getCurrentComposeRunLog();
  logger?.writeJsonArtifact("media-post-subject", {
    request,
    subject
  });

  options?.onProgress?.({
    stage: "planning",
    message: "Agent is planning the tweet angle from the asset",
    detail: subject.assetId ?? subject.usageId
  });
  const plan = await model.planPost({ request, subject });
  perf.mark("plan_ready", {
    queryCount: plan.searchQueries.length
  });
  logger?.writeJsonArtifact("media-post-plan", plan);

  options?.onProgress?.({
    stage: "searching",
    message: "Searching local media and imported meme templates",
    detail: plan.searchQueries.join(" | ")
  });
  const searchResult = await search.searchMany(plan.searchQueries);
  perf.mark("search_ready", {
    candidateCount: searchResult.candidates.length,
    warning: searchResult.warning ?? null
  });
  const currentAssetCandidate = buildCurrentAssetCandidate(subject);
  const allCandidates = [
    currentAssetCandidate,
    ...searchResult.candidates.filter((candidate) => candidate.candidateId !== currentAssetCandidate.candidateId)
  ];

  options?.onProgress?.({
    stage: "composing",
    message: "Agent is writing the tweet and choosing the best media",
    detail: `${allCandidates.length} candidates`
  });
  const draft = await model.composePost({
    request,
    subject,
    plan,
    candidates: allCandidates
  });
  perf.mark("draft_ready", {
    selectedCandidateId: draft.selectedCandidateId ?? null,
    candidateCount: allCandidates.length
  });
  logger?.writeJsonArtifact("media-post-draft", draft);

  const selectedMedia = allCandidates.find((candidate) => candidate.candidateId === draft.selectedCandidateId) ?? null;
  const alternativeMedia = allCandidates
    .filter((candidate) => candidate.candidateId !== draft.selectedCandidateId)
    .slice(0, 4);
  const wishlistEntries = plan.searchQueries.length > 0
    ? recordAssetWishlist({
        usageId: request.usageId,
        goal: "media_post",
        source: "media_post_composer",
        queryLabels: plan.searchQueries,
        angle: plan.angle,
        tweetText: subject.tweetText
      })
    : [];

  if (wishlistEntries.length > 0) {
    options?.onProgress?.({
      stage: "completed",
      message: "Saved missing asset ideas to the wishlist",
      detail: wishlistEntries.map((entry) => entry.label).join(" | ")
    });
  }

  options?.onProgress?.({
    stage: "completed",
    message: "Media-led tweet draft complete",
    detail: selectedMedia ? "media selected" : "current asset kept"
  });

  const result = {
    provider: model.providerId,
    request,
    subject,
    plan,
    tweet: {
      text: draft.tweetText,
      mediaSelectionReason: draft.mediaSelectionReason,
      whyThisTweetWorks: draft.whyThisTweetWorks,
      postingNotes: draft.postingNotes
    },
    search: {
      provider: search.providerId,
      queries: plan.searchQueries,
      resultCount: allCandidates.length,
      warning: searchResult.warning,
      wishlistSavedCount: wishlistEntries.length
    },
    selectedMedia,
    alternativeMedia
  };
  logger?.writeJsonArtifact("media-post-result", result);
  perf.end({
    selectedMedia: Boolean(selectedMedia),
    wishlistSavedCount: wishlistEntries.length
  });
  return result;
}
