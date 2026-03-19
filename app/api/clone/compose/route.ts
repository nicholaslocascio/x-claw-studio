import { cloneTweetRequestSchema, type CloneTweetProgressEvent } from "@/src/lib/clone-tweet-composer";
import { composeClonedTweet } from "@/src/server/clone-tweet-composer";
import { createComposeRoute } from "@/src/server/compose-route";

export const POST = createComposeRoute({
  schema: cloneTweetRequestSchema,
  kind: "clone_tweet",
  route: "app/api/clone/compose",
  errorTag: "clone/compose",
  unknownErrorMessage: "Unknown clone composition error",
  buildDraftInput: (body) => ({
    kind: "clone_tweet",
    usageId: null,
    tweetId: body.tweetId ?? null,
    requestMode: "single",
    progressStage: "starting",
    progressMessage: "Starting clone composition"
  }),
  run: (body, options) =>
    composeClonedTweet(body, {
      onProgress(event: CloneTweetProgressEvent) {
        options.onProgress(event);
      }
    })
});
