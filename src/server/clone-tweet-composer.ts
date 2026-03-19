import type {
  CloneTweetProgressEvent,
  CloneTweetRequest,
  CloneTweetResult
} from "@/src/lib/clone-tweet-composer";
import type { ReplyMediaCandidate } from "@/src/lib/reply-composer";
import { createCloneTweetComposerModel } from "@/src/server/clone-tweet-composer-model";
import { getCurrentComposeRunLog } from "@/src/server/compose-run-log";
import { resolveCloneTweetSubject } from "@/src/server/clone-tweet-subject";
import { CliFacetReplyMediaSearchProvider } from "@/src/server/reply-media-search";

function dedupeCandidates(candidates: ReplyMediaCandidate[]): ReplyMediaCandidate[] {
  const byKey = new Map<string, ReplyMediaCandidate>();

  for (const candidate of candidates) {
    const key = candidate.assetId ?? candidate.usageId ?? candidate.candidateId;
    const current = byKey.get(key);
    const nextScore = candidate.rankingScore ?? candidate.combinedScore;
    const currentScore = current ? current.rankingScore ?? current.combinedScore : Number.NEGATIVE_INFINITY;
    if (!current || nextScore > currentScore) {
      byKey.set(key, candidate);
    }
  }

  return Array.from(byKey.values()).sort(
    (left, right) => (right.rankingScore ?? right.combinedScore) - (left.rankingScore ?? left.combinedScore)
  );
}

function selectCandidatePool(input: {
  mediaMode: CloneTweetRequest["mediaMode"];
  sourceMedia: ReplyMediaCandidate[];
  searchCandidates: ReplyMediaCandidate[];
}): ReplyMediaCandidate[] {
  if (input.mediaMode === "keep_source_media") {
    return input.sourceMedia;
  }

  if (input.mediaMode === "search_new_media") {
    return input.searchCandidates;
  }

  if (input.mediaMode === "text_only") {
    return [];
  }

  return dedupeCandidates([...input.sourceMedia, ...input.searchCandidates]);
}

export async function composeClonedTweet(
  request: CloneTweetRequest,
  options?: {
    onProgress?: (event: CloneTweetProgressEvent) => void;
  }
): Promise<CloneTweetResult> {
  options?.onProgress?.({
    stage: "starting",
    message: "Loading source tweet context",
    detail: request.tweetId ?? request.xUrl ?? request.sourceText?.slice(0, 80) ?? null
  });

  const subject = await resolveCloneTweetSubject(request);
  const model = createCloneTweetComposerModel();
  const search = new CliFacetReplyMediaSearchProvider({ scope: "clone" });
  const logger = getCurrentComposeRunLog();
  logger?.writeJsonArtifact("clone-subject", {
    request,
    subject
  });

  options?.onProgress?.({
    stage: "planning",
    message: "Planning how to preserve and change the source tweet",
    detail: subject.tweetText
  });
  const plan = await model.planTweet({
    request,
    subject
  });
  logger?.writeJsonArtifact("clone-plan", plan);

  let searchCandidates: ReplyMediaCandidate[] = [];
  let searchWarning: string | null = null;
  if (
    request.mediaMode === "auto" ||
    request.mediaMode === "search_new_media" ||
    (request.mediaMode === "keep_source_media" && subject.sourceMedia.length === 0)
  ) {
    const queryLabel = plan.searchQueries.join(" | ") || "no search queries";
    options?.onProgress?.({
      stage: "searching",
      message: "Searching local media candidates",
      detail: queryLabel
    });
    const searchResult = await search.searchMany(plan.searchQueries, 8, 12);
    searchCandidates = searchResult.candidates;
    searchWarning = searchResult.warning;
  }

  const candidatePool = selectCandidatePool({
    mediaMode: request.mediaMode,
    sourceMedia: subject.sourceMedia,
    searchCandidates
  });

  options?.onProgress?.({
    stage: "composing",
    message: "Writing the cloned tweet and picking media",
    detail: `${candidatePool.length} candidates`
  });
  const draft = await model.composeTweet({
    request,
    subject,
    plan,
    candidates: candidatePool
  });
  logger?.writeJsonArtifact("clone-draft", draft);

  const selectedMedia = candidatePool.find((candidate) => candidate.candidateId === draft.selectedCandidateId) ?? null;
  const alternativeMedia = candidatePool.filter((candidate) => candidate.candidateId !== draft.selectedCandidateId).slice(0, 8);

  options?.onProgress?.({
    stage: "completed",
    message: "Clone draft complete",
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
      resultCount: searchCandidates.length,
      warning: searchWarning
    },
    selectedMedia,
    alternativeMedia
  };
  logger?.writeJsonArtifact("clone-result", result);
  return result;
}
