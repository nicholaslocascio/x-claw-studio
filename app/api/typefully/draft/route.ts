import { NextResponse } from "next/server";
import { createTypefullyDraftRequestSchema } from "@/src/lib/typefully";
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
      if (body.draftId && body.outputIndex !== null && body.outputIndex !== undefined) {
        markGeneratedDraftOutputTypefullyFailed({
          draftId: body.draftId,
          outputIndex: body.outputIndex,
          errorMessage: error instanceof Error ? error.message : "Unknown Typefully draft error"
        });
      }

      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unknown Typefully draft error" },
        { status: 500 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid Typefully draft request" },
      { status: 400 }
    );
  }
}
