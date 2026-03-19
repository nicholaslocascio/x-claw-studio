import { NextResponse } from "next/server";
import { z } from "zod";
import type { MemeTemplateImportProgressEvent } from "@/src/lib/meme-template";
import { logRouteError } from "@/src/server/api-error";
import { createNdjsonStreamController } from "@/src/server/ndjson-response";
import { importWishlistMemeFromMemingWorld } from "@/src/server/meme-template-import";

const requestSchema = z.object({
  key: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const streamController = createNdjsonStreamController(controller, encoder);

        try {
          const result = await importWishlistMemeFromMemingWorld(body.key, {
            onProgress(event: MemeTemplateImportProgressEvent) {
              streamController.write({ type: "progress", ...event });
            }
          });

          streamController.write({
            type: "result",
            result: {
              key: result.key,
              title: result.title,
              pageUrl: result.pageUrl
            }
          });
          streamController.close();
        } catch (error) {
          const message = logRouteError("reply-media-wishlist/import.stream", request, error, "Unknown meme import error");
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
    const message = logRouteError("reply-media-wishlist/import", request, error, "Unknown meme import error");
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
