import { NextResponse } from "next/server";
import { replySourceLookupRequestSchema } from "@/src/lib/reply-composer";
import { resolveReplySourceFromUrl } from "@/src/server/reply-composer-subject";

export async function POST(request: Request) {
  try {
    const body = replySourceLookupRequestSchema.parse(await request.json());
    const result = await resolveReplySourceFromUrl({
      xUrl: body.xUrl
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown reply source lookup error" },
      { status: 500 }
    );
  }
}
