import { ZodError } from "zod";
import { NextResponse } from "next/server";
import { replySourceLookupRequestSchema } from "@/src/lib/reply-composer";
import { logRouteError } from "@/src/server/api-error";
import { resolveReplySourceFromUrl } from "@/src/server/reply-composer-subject";

export async function POST(request: Request) {
  try {
    const body = replySourceLookupRequestSchema.parse(await request.json());
    const result = await resolveReplySourceFromUrl({
      xUrl: body.xUrl
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid reply source request" },
        { status: 400 }
      );
    }

    const message = logRouteError("reply/source", request, error, "Unknown reply source lookup error");
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
