import { NextResponse } from "next/server";
import { listTypefullySocialSets } from "@/src/server/typefully";
import { logRouteError } from "@/src/server/api-error";

export async function GET(request: Request) {
  try {
    const socialSets = await listTypefullySocialSets();
    return NextResponse.json({ socialSets });
  } catch (error) {
    const message = logRouteError("typefully/social-sets", request, error, "Failed to load Typefully social sets");
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
