import { manualPostRequestSchema, type ManualPostProgressEvent } from "@/src/lib/manual-post-composer";
import { createComposeRoute } from "@/src/server/compose-route";
import { composeTweetFromManualBrief } from "@/src/server/manual-post-composer";

export const POST = createComposeRoute({
  schema: manualPostRequestSchema,
  kind: "manual_post",
  route: "app/api/manual-post/compose",
  errorTag: "manual-post/compose",
  unknownErrorMessage: "Unknown manual-post composition error",
  buildDraftInput: () => ({
    kind: "manual_post",
    requestMode: "single",
    progressStage: "starting",
    progressMessage: "Starting manual-post composition"
  }),
  run: (body, options) =>
    composeTweetFromManualBrief(body, {
      onProgress(event: ManualPostProgressEvent) {
        options.onProgress(event);
      }
    })
});
