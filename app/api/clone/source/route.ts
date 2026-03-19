import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { cloneTweetSourceLookupRequestSchema } from "@/src/lib/clone-tweet-composer";
import { logRouteError } from "@/src/server/api-error";
import { resolveCloneTweetSource } from "@/src/server/clone-tweet-subject";

export async function POST(request: Request) {
  try {
    const body = cloneTweetSourceLookupRequestSchema.parse(await request.json());
    const result = await resolveCloneTweetSource(body);
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid clone source request" },
        { status: 400 }
      );
    }

    const message = logRouteError("clone/source", request, error, "Unknown clone source lookup error");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
