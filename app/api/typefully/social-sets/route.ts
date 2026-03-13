import { NextResponse } from "next/server";
import { listTypefullySocialSets } from "@/src/server/typefully";

export async function GET() {
  try {
    const socialSets = await listTypefullySocialSets();
    return NextResponse.json({ socialSets });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Typefully social sets" },
      { status: 500 }
    );
  }
}
