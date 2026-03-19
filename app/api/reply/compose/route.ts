import {
  type ReplyCompositionBatchResult,
  replyCompositionRequestSchema,
  type ReplyCompositionResult,
  type ReplyCompositionProgressEvent
} from "@/src/lib/reply-composer";
import { createComposeRoute } from "@/src/server/compose-route";
import { composeReplyForUsage, composeRepliesForAllGoals } from "@/src/server/reply-composer";

export const POST = createComposeRoute({
  schema: replyCompositionRequestSchema,
  kind: "reply",
  route: "app/api/reply/compose",
  errorTag: "reply/compose",
  unknownErrorMessage: "Unknown reply composition error",
  buildDraftInput: (body) => ({
    kind: "reply",
    usageId: body.usageId ?? null,
    tweetId: body.tweetId ?? null,
    requestGoal: body.goal,
    requestMode: body.mode,
    progressStage: "starting",
    progressMessage: "Starting reply composition"
  }),
  run: (
    body,
    options
  ): Promise<ReplyCompositionResult | ReplyCompositionBatchResult> =>
    body.mode === "all_goals"
      ? composeRepliesForAllGoals(body, {
          onProgress(event: ReplyCompositionProgressEvent) {
            options.onProgress(event);
          }
        })
      : composeReplyForUsage(body, {
          onProgress(event: ReplyCompositionProgressEvent) {
            options.onProgress(event);
          }
        })
});
