import { NextResponse } from "next/server";
import { createTypefullyDraftRequestSchema } from "@/src/lib/typefully";
import { logRouteError } from "@/src/server/api-error";
import { markGeneratedDraftOutputSavedToTypefully, markGeneratedDraftOutputTypefullyFailed } from "@/src/server/generated-drafts";
import { createTypefullyDraft } from "@/src/server/typefully";

export async function POST(request: Request) {
  try {
    const body = createTypefullyDraftRequestSchema.parse(await request.json());

    try {
      const result = await createTypefullyDraft(body);

      if (body.draftId && body.outputIndex !== null && body.outputIndex !== undefined) {
        markGeneratedDraftOutputSavedToTypefully({
          draftId: body.draftId,
          outputIndex: body.outputIndex,
          savedAt: result.completedAt,
          typefullyDraftId: result.typefullyDraftId,
          typefullyStatus: result.status,
          typefullyPrivateUrl: result.privateUrl,
          typefullyShareUrl: result.shareUrl
        });
      }

      return NextResponse.json(result);
    } catch (error) {
      const message = logRouteError("typefully/draft.create", request, error, "Unknown Typefully draft error");
      if (body.draftId && body.outputIndex !== null && body.outputIndex !== undefined) {
        markGeneratedDraftOutputTypefullyFailed({
          draftId: body.draftId,
          outputIndex: body.outputIndex,
          errorMessage: message
        });
      }

      return NextResponse.json(
        { error: message },
        { status: 500 }
      );
    }
  } catch (error) {
    const message = logRouteError("typefully/draft.request", request, error, "Invalid Typefully draft request");
    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}
