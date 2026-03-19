import { NextResponse } from "next/server";
import { getCapturedTweetData, getCapturedTweetPage, MAX_CAPTURED_TWEET_PAGE_SIZE } from "@/src/server/data";
import { logRouteError } from "@/src/server/api-error";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pageRaw = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const limitRaw = Number.parseInt(searchParams.get("limit") ?? String(MAX_CAPTURED_TWEET_PAGE_SIZE), 10);
    const data = getCapturedTweetData();
    const result = getCapturedTweetPage({
      tweets: data.capturedTweets,
      page: Number.isFinite(pageRaw) ? pageRaw : 1,
      pageSize: Number.isFinite(limitRaw) ? limitRaw : MAX_CAPTURED_TWEET_PAGE_SIZE,
      query: searchParams.get("query"),
      tweetFilter: searchParams.get("filter"),
      sort: searchParams.get("sort")
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = logRouteError("tweets", request, error, "Unknown tweet listing error");
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
