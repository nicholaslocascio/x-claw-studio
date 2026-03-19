import type {
  ReplyCompositionBatchResult,
  ReplyCompositionProgressEvent,
  ReplyCompositionRequest
} from "@/src/lib/reply-composer";
import {
  createComposeRunLog,
  finalizeComposeRun,
  getCurrentComposeRunLog,
  recordComposeRunError,
  runWithComposeRunLog,
  writeComposeRunJson
} from "@/src/server/compose-run-log";
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
  const composeRun = createComposeRunLog({
    kind: "reply",
    draftId: draftRecord.draftId,
    route: "src/server/reply-composer-job",
    request: composeRequest
  });
  updateGeneratedDraft(draftRecord.draftId, {
    composeRunId: composeRun.runId,
    composeRunLogDir: composeRun.relativeLogDir
  });
  try {
    const result = await runWithComposeRunLog(composeRun, async () => {
      const runLogger = getCurrentComposeRunLog();
      return composeRepliesForAllGoals(composeRequest, {
        onProgress(event: ReplyCompositionProgressEvent) {
          updateGeneratedDraft(draftRecord.draftId, {
            progressStage: event.stage,
            progressMessage: event.message,
            progressDetail: event.detail ?? null
          });
          runLogger?.recordProgress(event);
          options?.onProgress?.(event);
        }
      });
    });

    markGeneratedDraftComplete({
      draftId: draftRecord.draftId,
      kind: "reply",
      result
    });
    writeComposeRunJson(composeRun, "result.json", result);
    finalizeComposeRun(composeRun, "completed", {
      draftId: draftRecord.draftId
    });

    return result;
  } catch (error) {
    updateGeneratedDraft(draftRecord.draftId, {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "Unknown reply composition error"
    });
    recordComposeRunError(composeRun, "reply-composer-job", error, {
      draftId: draftRecord.draftId
    });
    finalizeComposeRun(composeRun, "failed", {
      draftId: draftRecord.draftId,
      errorMessage: error instanceof Error ? error.message : "Unknown reply composition error"
    });
    throw error;
  }
}
