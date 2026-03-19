import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import type { GeneratedDraftKind } from "@/src/lib/generated-drafts";
import {
  createComposeRunLog,
  finalizeComposeRun,
  getCurrentComposeRunLog,
  recordComposeRunError,
  runWithComposeRunLog,
  writeComposeRunJson
} from "@/src/server/compose-run-log";
import { createGeneratedDraft, markGeneratedDraftComplete, updateGeneratedDraft } from "@/src/server/generated-drafts";
import { createNdjsonStreamController } from "@/src/server/ndjson-response";
import { logRouteError } from "@/src/server/api-error";
import { createPerfTrace } from "@/src/server/perf-log";

type ComposeProgressEvent = {
  stage: string;
  message: string;
  detail?: string | null;
};

interface CreateComposeRouteConfig<TBody, TProgress extends ComposeProgressEvent, TResult> {
  schema: ZodType<TBody>;
  kind: GeneratedDraftKind;
  route: string;
  errorTag: string;
  unknownErrorMessage: string;
  buildDraftInput: (body: TBody) => Parameters<typeof createGeneratedDraft>[0];
  run: (body: TBody, options: { onProgress: (event: TProgress) => void }) => Promise<TResult>;
}

export function createComposeRoute<
  TBody,
  TProgress extends ComposeProgressEvent,
  TResult extends Parameters<typeof markGeneratedDraftComplete>[0]["result"]
>(
  config: CreateComposeRouteConfig<TBody, TProgress, TResult>
) {
  return async function POST(request: Request) {
    const routePerf = createPerfTrace(`api:${config.errorTag}`, {
      kind: config.kind,
      route: config.route,
      method: request.method
    });

    try {
      const body = config.schema.parse(await request.json());
      routePerf.mark("request_parsed");
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const streamController = createNdjsonStreamController(controller, encoder);
          const draftRecord = createGeneratedDraft(config.buildDraftInput(body));
          const composeRun = createComposeRunLog({
            kind: config.kind,
            draftId: draftRecord.draftId,
            route: config.route,
            request: body
          });

          updateGeneratedDraft(draftRecord.draftId, {
            composeRunId: composeRun.runId,
            composeRunLogDir: composeRun.relativeLogDir
          });
          routePerf.mark("stream_initialized", {
            draftId: draftRecord.draftId,
            composeRunId: composeRun.runId
          });
          streamController.write({
            type: "draft",
            draft: {
              draftId: draftRecord.draftId,
              composeRunId: composeRun.runId,
              composeRunLogDir: composeRun.relativeLogDir
            }
          });

          try {
            const result = await runWithComposeRunLog(composeRun, async () => {
              const runLogger = getCurrentComposeRunLog();
              routePerf.mark("compose_started");
              return config.run(body, {
                onProgress(event) {
                  updateGeneratedDraft(draftRecord.draftId, {
                    progressStage: event.stage,
                    progressMessage: event.message,
                    progressDetail: event.detail ?? null
                  });
                  runLogger?.recordProgress(event);
                  streamController.write({ type: "progress", ...event });
                }
              });
            });

            markGeneratedDraftComplete({
              draftId: draftRecord.draftId,
              kind: config.kind,
              result
            });
            writeComposeRunJson(composeRun, "result.json", result);
            finalizeComposeRun(composeRun, "completed", {
              draftId: draftRecord.draftId
            });
            routePerf.end({
              draftId: draftRecord.draftId,
              composeRunId: composeRun.runId
            });
            streamController.write({ type: "result", result });
            streamController.close();
          } catch (error) {
            routePerf.fail(error, {
              draftId: draftRecord.draftId,
              composeRunId: composeRun.runId
            });
            const message = logRouteError(
              `${config.errorTag}.stream`,
              request,
              error,
              config.unknownErrorMessage
            );
            updateGeneratedDraft(draftRecord.draftId, {
              status: "failed",
              errorMessage: message
            });
            recordComposeRunError(composeRun, config.errorTag, error, {
              draftId: draftRecord.draftId
            });
            finalizeComposeRun(composeRun, "failed", {
              draftId: draftRecord.draftId,
              errorMessage: message
            });
            streamController.write({
              type: "error",
              error: message
            });
            streamController.close();
          }
        }
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache, no-transform"
        }
      });
    } catch (error) {
      routePerf.fail(error);
      const message = logRouteError(config.errorTag, request, error, config.unknownErrorMessage);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
