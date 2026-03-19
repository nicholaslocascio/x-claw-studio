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
import { getCurrentComposeRunLog } from "@/src/server/compose-run-log";
import { resolveReplyComposerSubject } from "@/src/server/reply-composer-subject";
import { createPerfTrace } from "@/src/server/perf-log";

const REPLY_SEARCH_LIMIT_PER_QUERY = 15;
const REPLY_SAVED_MEDIA_CANDIDATE_LIMIT = 30;

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
  const perf = createPerfTrace("compose:reply", {
    goal: request.goal,
    usageId: subject.usageId ?? null,
    tweetId: subject.tweetId ?? null
  });
  const effectiveRequest = buildEffectiveReplyRequest(request, subject);
  const model = createReplyComposerModel();
  const search = new CliFacetReplyMediaSearchProvider({ scope: "reply" });
  const logger = getCurrentComposeRunLog();
  logger?.writeJsonArtifact("reply-subject", {
    request: effectiveRequest,
    subject
  });

  options?.onProgress?.({
    stage: "planning",
    message: "Agent is planning the reply angle and search terms",
    detail: subject.tweetText,
    goal: effectiveRequest.goal
  });
  const plan = await model.planReply({ request: effectiveRequest, subject });
  perf.mark("plan_ready", {
    queryCount: plan.searchQueries.length
  });
  logger?.writeJsonArtifact("reply-plan", plan);
  options?.onProgress?.({
    stage: "searching",
    message: "Searching local media candidates",
    detail: plan.searchQueries.join(" | "),
    goal: effectiveRequest.goal
  });
  const searchResult = await search.searchMany(
    plan.searchQueries,
    REPLY_SEARCH_LIMIT_PER_QUERY,
    REPLY_SAVED_MEDIA_CANDIDATE_LIMIT
  );
  perf.mark("search_ready", {
    candidateCount: searchResult.candidates.length,
    warning: searchResult.warning ?? null
  });
  options?.onProgress?.({
    stage: "composing",
    message: "Agent is choosing media and writing the final reply",
    detail: `${searchResult.candidates.length} candidates`,
    goal: effectiveRequest.goal
  });
  const draft = await model.composeReply({
    request: effectiveRequest,
    subject,
    plan,
    candidates: searchResult.candidates
  });
  perf.mark("draft_ready", {
    selectedCandidateId: draft.selectedCandidateId ?? null
  });
  logger?.writeJsonArtifact("reply-draft", draft);

  const selectedMedia =
    searchResult.candidates.find((candidate) => candidate.candidateId === draft.selectedCandidateId) ?? null;
  const alternativeMedia = searchResult.candidates
    .filter((candidate) => candidate.candidateId !== draft.selectedCandidateId)
    .slice(0, REPLY_SAVED_MEDIA_CANDIDATE_LIMIT - (selectedMedia ? 1 : 0));
  const wishlistEntries = plan.searchQueries.length > 0
    ? recordReplyMediaWishlist({
        usageId: effectiveRequest.usageId ?? null,
        goal: effectiveRequest.goal,
        queryLabels: plan.searchQueries,
        angle: plan.angle,
        tweetText: subject.tweetText
      })
    : [];
  const queryOutcomes = searchResult.queryOutcomes ?? [];

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
      rawResultCount: queryOutcomes.reduce((sum, outcome) => sum + outcome.resultCount, 0),
      warning: searchResult.warning,
      queryOutcomes,
      wishlistSavedCount: wishlistEntries.length
    },
    selectedMedia,
    alternativeMedia
  };
  logger?.writeJsonArtifact("reply-result", result);
  perf.end({
    selectedMedia: Boolean(selectedMedia),
    wishlistSavedCount: wishlistEntries.length
  });

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
  const perf = createPerfTrace("compose:reply.subject", {
    goal: request.goal,
    usageId: request.usageId ?? null,
    tweetId: request.tweetId ?? null
  });
  options?.onProgress?.({
    stage: "starting",
    message: "Loading subject tweet context",
    detail: request.usageId ?? request.tweetId ?? null,
    goal: request.goal
  });
  const subject = await resolveReplyComposerSubject(request, options);
  perf.end({
    resolvedUsageId: subject.usageId ?? null,
    resolvedTweetId: subject.tweetId ?? null
  });
  return composeReplyForPreparedSubject(request, subject, options);
}

export async function composeRepliesForAllGoals(
  request: ReplyCompositionRequest,
  options?: {
    onProgress?: (event: ReplyCompositionProgressEvent) => void;
  }
): Promise<ReplyCompositionBatchResult> {
  const perf = createPerfTrace("compose:reply.batch", {
    usageId: request.usageId ?? null,
    tweetId: request.tweetId ?? null,
    goalCount: REPLY_COMPOSITION_GOALS.length
  });
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
  perf.mark("subject_ready", {
    resolvedUsageId: subject.usageId ?? null,
    resolvedTweetId: subject.tweetId ?? null
  });
  const results = await composeAllGoals({
    goals: REPLY_COMPOSITION_GOALS,
    request,
    runSingle: (goalRequest, goalOptions) => composeReplyForPreparedSubject(goalRequest, subject, goalOptions),
    onProgress: options?.onProgress,
    maxConcurrency: request.maxConcurrency
  });
  perf.end({
    resultCount: results.length
  });

  return {
    mode: "all_goals",
    usageId: request.usageId ?? null,
    tweetId: request.tweetId ?? null,
    results
  };
}
