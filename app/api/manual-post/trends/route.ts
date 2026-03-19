import { NextResponse } from "next/server";
import { buildTrendDigestBrief } from "@/src/server/trend-post-brief";

function parseParam(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const result = await buildTrendDigestBrief({
    timeframeHours: parseParam(searchParams.get("timeframeHours"), 48),
    maxTopics: parseParam(searchParams.get("maxTopics"), 6),
    maxTweets: parseParam(searchParams.get("maxTweets"), 8)
  });

  return NextResponse.json(result);
}
