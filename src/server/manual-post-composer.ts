import type {
  ManualPostProgressEvent,
  ManualPostRequest,
  ManualPostResult,
  ManualPostSubject
} from "@/src/lib/manual-post-composer";
import { getCurrentComposeRunLog } from "@/src/server/compose-run-log";
import { createManualPostComposerModel } from "@/src/server/manual-post-composer-model";
import { CliFacetReplyMediaSearchProvider } from "@/src/server/reply-media-search";
import { recordAssetWishlist } from "@/src/server/reply-media-wishlist";

function buildManualPostSubject(briefText: string): ManualPostSubject {
  const extractedHooks = Array.from(
    new Set(
      briefText
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 6)
    )
  );

  return {
    briefText,
    extractedHooks,
    sourceMode: "general",
    trendContext: null
  };
}

function buildManualPostSubjectFromRequest(request: ManualPostRequest): ManualPostSubject {
  const subject = buildManualPostSubject(request.briefText);

  return {
    ...subject,
    sourceMode: request.sourceMode === "trend_digest" ? "trend_digest" : "general",
    trendContext: request.trendContext
      ? {
          timeframeHours: request.trendContext.timeframeHours,
          generatedAt: request.trendContext.generatedAt,
          topicCount: request.trendContext.topicCount,
          tweetCount: request.trendContext.tweetCount,
          topics: request.trendContext.topics,
          tweets: request.trendContext.tweets
        }
      : null
  };
}

export async function composeTweetFromManualBrief(
  request: ManualPostRequest,
  options?: {
    onProgress?: (event: ManualPostProgressEvent) => void;
  }
): Promise<ManualPostResult> {
  options?.onProgress?.({
    stage: "starting",
    message: "Loading manual brief",
    detail: `${request.briefText.length} chars`
  });

  const subject = buildManualPostSubjectFromRequest(request);
  const model = createManualPostComposerModel();
  const search = new CliFacetReplyMediaSearchProvider({ scope: "manual-post" });
  const logger = getCurrentComposeRunLog();
  logger?.writeJsonArtifact("manual-post-subject", {
    request,
    subject
  });

  options?.onProgress?.({
    stage: "planning",
    message:
      subject.sourceMode === "trend_digest"
        ? "Agent is planning a trend-digest post from the last 48 hours"
        : "Agent is planning a post angle from the pasted brief",
    detail: subject.extractedHooks[0] ?? null
  });
  const plan = await model.planPost({ request, subject });
  logger?.writeJsonArtifact("manual-post-plan", plan);

  options?.onProgress?.({
    stage: "searching",
    message: "Searching local media candidates",
    detail: plan.searchQueries.join(" | ")
  });
  const searchResult = await search.searchMany(plan.searchQueries);

  options?.onProgress?.({
    stage: "composing",
    message:
      subject.sourceMode === "trend_digest"
        ? "Agent is writing the stacked trend post and choosing optional media"
        : "Agent is writing the post and choosing optional media",
    detail: `${searchResult.candidates.length} candidates`
  });
  const draft = await model.composePost({
    request,
    subject,
    plan,
    candidates: searchResult.candidates
  });
  logger?.writeJsonArtifact("manual-post-draft", draft);

  const selectedMedia = searchResult.candidates.find((candidate) => candidate.candidateId === draft.selectedCandidateId) ?? null;
  const alternativeMedia = searchResult.candidates
    .filter((candidate) => candidate.candidateId !== draft.selectedCandidateId)
    .slice(0, 4);
  const wishlistEntries = plan.searchQueries.length > 0
    ? recordAssetWishlist({
        usageId: null,
        goal: "manual_post",
        source: "manual_post_composer",
        queryLabels: plan.searchQueries,
        angle: plan.angle,
        tweetText: subject.briefText
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
    message: "Manual-post draft complete",
    detail: selectedMedia ? "media selected" : "text-only draft"
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
      resultCount: searchResult.candidates.length,
      warning: searchResult.warning,
      wishlistSavedCount: wishlistEntries.length
    },
    selectedMedia,
    alternativeMedia
  };
  logger?.writeJsonArtifact("manual-post-result", result);
  return result;
}
