import type {
  ReplyCompositionBatchResult,
  ReplyCompositionProgressEvent,
  ReplyCompositionRequest,
  ReplyCompositionResult,
  ReplyComposerSubject
} from "@/src/lib/reply-composer";
import { createReplyComposerModel } from "@/src/server/reply-composer-model";
import { CliFacetReplyMediaSearchProvider } from "@/src/server/reply-media-search";
import { REPLY_COMPOSITION_GOALS } from "@/src/lib/reply-composer";
import { recordReplyMediaWishlist } from "@/src/server/reply-media-wishlist";
import { composeAllGoals } from "@/src/server/composer-batch";
import { resolveReplyComposerSubject } from "@/src/server/reply-composer-subject";

function buildEffectiveReplyRequest(
  request: ReplyCompositionRequest,
  subject: ReplyComposerSubject
): ReplyCompositionRequest {
  return {
    ...request,
    usageId: subject.usageId ?? request.usageId,
    tweetId: subject.tweetId ?? request.tweetId
  };
}

async function composeReplyForPreparedSubject(
  request: ReplyCompositionRequest,
  subject: ReplyComposerSubject,
  options?: {
    onProgress?: (event: ReplyCompositionProgressEvent) => void;
  }
): Promise<ReplyCompositionResult> {
  const effectiveRequest = buildEffectiveReplyRequest(request, subject);
  const model = createReplyComposerModel();
  const search = new CliFacetReplyMediaSearchProvider();

  options?.onProgress?.({
    stage: "planning",
    message: "Gemini is planning the reply angle and search terms",
    detail: subject.tweetText,
    goal: effectiveRequest.goal
  });
  const plan = await model.planReply({ request: effectiveRequest, subject });
  options?.onProgress?.({
    stage: "searching",
    message: "Searching local media candidates",
    detail: plan.searchQueries.join(" | "),
    goal: effectiveRequest.goal
  });
  const searchResult = await search.searchMany(plan.searchQueries);
  options?.onProgress?.({
    stage: "composing",
    message: "Gemini is choosing media and writing the final reply",
    detail: `${searchResult.candidates.length} candidates`,
    goal: effectiveRequest.goal
  });
  const draft = await model.composeReply({
    request: effectiveRequest,
    subject,
    plan,
    candidates: searchResult.candidates
  });

  const selectedMedia =
    searchResult.candidates.find((candidate) => candidate.candidateId === draft.selectedCandidateId) ?? null;
  const alternativeMedia = searchResult.candidates
    .filter((candidate) => candidate.candidateId !== draft.selectedCandidateId)
    .slice(0, 4);
  const wishlistEntries = plan.searchQueries.length > 0
    ? recordReplyMediaWishlist({
        usageId: effectiveRequest.usageId ?? null,
        goal: effectiveRequest.goal,
        queryLabels: plan.searchQueries,
        angle: plan.angle,
        tweetText: subject.tweetText
      })
    : [];

  if (wishlistEntries.length > 0) {
    options?.onProgress?.({
      stage: "completed",
      message: "Saved missing asset ideas to the wishlist",
      detail: wishlistEntries.map((entry) => entry.label).join(" | "),
      goal: effectiveRequest.goal
    });
  }

  const result = {
    provider: model.providerId,
    request: effectiveRequest,
    subject,
    plan,
    reply: {
      text: draft.replyText,
      whyThisReplyWorks: draft.whyThisReplyWorks,
      postingNotes: draft.postingNotes,
      mediaSelectionReason: draft.mediaSelectionReason
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

  options?.onProgress?.({
    stage: "completed",
    message: "Reply draft complete",
    detail: selectedMedia ? "media selected" : "text-only draft",
    goal: effectiveRequest.goal
  });

  return result;
}

export async function composeReplyForUsage(
  request: ReplyCompositionRequest,
  options?: {
    onProgress?: (event: ReplyCompositionProgressEvent) => void;
  }
): Promise<ReplyCompositionResult> {
  options?.onProgress?.({
    stage: "starting",
    message: "Loading subject tweet context",
    detail: request.usageId ?? request.tweetId ?? null,
    goal: request.goal
  });
  const subject = await resolveReplyComposerSubject(request, options);
  return composeReplyForPreparedSubject(request, subject, options);
}

export async function composeRepliesForAllGoals(
  request: ReplyCompositionRequest,
  options?: {
    onProgress?: (event: ReplyCompositionProgressEvent) => void;
  }
): Promise<ReplyCompositionBatchResult> {
  options?.onProgress?.({
    stage: "starting",
    message: "Loading subject tweet context once for all goals",
    detail: request.usageId ?? request.tweetId ?? null,
    goal: null,
    completedGoals: 0,
    totalGoals: REPLY_COMPOSITION_GOALS.length,
    runningGoals: 0,
    queuedGoals: REPLY_COMPOSITION_GOALS.length
  });
  const subject = await resolveReplyComposerSubject(request, {
    onProgress: options?.onProgress,
    progressGoal: null
  });
  const results = await composeAllGoals({
    goals: REPLY_COMPOSITION_GOALS,
    request,
    runSingle: (goalRequest, goalOptions) => composeReplyForPreparedSubject(goalRequest, subject, goalOptions),
    onProgress: options?.onProgress,
    maxConcurrency: request.maxConcurrency
  });

  return {
    mode: "all_goals",
    usageId: request.usageId ?? null,
    tweetId: request.tweetId ?? null,
    results
  };
}
