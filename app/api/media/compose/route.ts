import { mediaPostRequestSchema, type MediaPostProgressEvent } from "@/src/lib/media-post-composer";
import { createComposeRoute } from "@/src/server/compose-route";
import { composeTweetFromMediaAsset } from "@/src/server/media-post-composer";

export const POST = createComposeRoute({
  schema: mediaPostRequestSchema,
  kind: "media_post",
  route: "app/api/media/compose",
  errorTag: "media/compose",
  unknownErrorMessage: "Unknown media composition error",
  buildDraftInput: (body) => ({
    kind: "media_post",
    usageId: body.usageId,
    requestMode: "single",
    progressStage: "starting",
    progressMessage: "Starting media composition"
  }),
  run: (body, options) =>
    composeTweetFromMediaAsset(body, {
      onProgress(event: MediaPostProgressEvent) {
        options.onProgress(event);
      }
    })
});
