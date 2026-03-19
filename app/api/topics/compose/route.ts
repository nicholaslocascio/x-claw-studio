import {
  topicPostRequestSchema,
  type TopicPostBatchResult,
  type TopicPostProgressEvent,
  type TopicPostResult
} from "@/src/lib/topic-composer";
import { createComposeRoute } from "@/src/server/compose-route";
import { composeTweetFromTopic, composeTweetsFromTopicForAllGoals } from "@/src/server/topic-composer";

export const POST = createComposeRoute({
  schema: topicPostRequestSchema,
  kind: "topic_post",
  route: "app/api/topics/compose",
  errorTag: "topics/compose",
  unknownErrorMessage: "Unknown topic composition error",
  buildDraftInput: (body) => ({
    kind: "topic_post",
    topicId: body.topicId,
    requestGoal: body.goal,
    requestMode: body.mode,
    progressStage: "starting",
    progressMessage: "Starting topic composition"
  }),
  run: (
    body,
    options
  ): Promise<TopicPostResult | TopicPostBatchResult> =>
    body.mode === "all_goals"
      ? composeTweetsFromTopicForAllGoals(body, {
          onProgress(event: TopicPostProgressEvent) {
            options.onProgress(event);
          }
        })
      : composeTweetFromTopic(body, {
          onProgress(event: TopicPostProgressEvent) {
            options.onProgress(event);
          }
        })
});
