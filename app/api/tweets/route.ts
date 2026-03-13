import { NextResponse } from "next/server";
import { getDashboardData, getCapturedTweetPage, MAX_CAPTURED_TWEET_PAGE_SIZE } from "@/src/server/data";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pageRaw = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const limitRaw = Number.parseInt(searchParams.get("limit") ?? String(MAX_CAPTURED_TWEET_PAGE_SIZE), 10);
    const data = getDashboardData();
    const result = getCapturedTweetPage({
      tweets: data.capturedTweets,
      page: Number.isFinite(pageRaw) ? pageRaw : 1,
      pageSize: Number.isFinite(limitRaw) ? limitRaw : MAX_CAPTURED_TWEET_PAGE_SIZE,
      query: searchParams.get("query"),
      tweetFilter: searchParams.get("filter")
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown tweet listing error" },
      { status: 500 }
    );
  }
}
