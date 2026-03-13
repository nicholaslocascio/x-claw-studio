import type {
  ReplyCompositionBatchResult,
  ReplyCompositionProgressEvent,
  ReplyCompositionRequest
} from "@/src/lib/reply-composer";
import { composeRepliesForAllGoals } from "@/src/server/reply-composer";
import { createGeneratedDraft, markGeneratedDraftComplete, updateGeneratedDraft } from "@/src/server/generated-drafts";

export async function generateAllReplyDraftsForTweet(
  request: Pick<ReplyCompositionRequest, "tweetId" | "toneHint" | "angleHint" | "constraints" | "maxConcurrency">,
  options?: {
    onProgress?: (event: ReplyCompositionProgressEvent) => void;
  }
): Promise<ReplyCompositionBatchResult> {
  if (!request.tweetId) {
    throw new Error("Reply draft generation requires a tweetId");
  }

  const composeRequest: ReplyCompositionRequest = {
    tweetId: request.tweetId,
    goal: "insight",
    mode: "all_goals",
    maxConcurrency: request.maxConcurrency,
    toneHint: request.toneHint,
    angleHint: request.angleHint,
    constraints: request.constraints
  };

  const draftRecord = createGeneratedDraft({
    kind: "reply",
    tweetId: request.tweetId,
    requestGoal: composeRequest.goal,
    requestMode: composeRequest.mode,
    progressStage: "starting",
    progressMessage: "Starting reply composition"
  });

  try {
    const result = await composeRepliesForAllGoals(composeRequest, {
      onProgress(event: ReplyCompositionProgressEvent) {
        updateGeneratedDraft(draftRecord.draftId, {
          progressStage: event.stage,
          progressMessage: event.message,
          progressDetail: event.detail ?? null
        });
        options?.onProgress?.(event);
      }
    });

    markGeneratedDraftComplete({
      draftId: draftRecord.draftId,
      kind: "reply",
      result
    });

    return result;
  } catch (error) {
    updateGeneratedDraft(draftRecord.draftId, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown reply composition error"
    });
    throw error;
  }
}
