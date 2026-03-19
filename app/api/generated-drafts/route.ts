import { NextResponse } from "next/server";
import { listGeneratedDrafts } from "@/src/server/generated-drafts";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kindRaw = searchParams.get("kind");
  const kind =
    kindRaw === "reply" || kindRaw === "topic_post" || kindRaw === "media_post" || kindRaw === "manual_post" || kindRaw === "clone_tweet"
      ? kindRaw
      : undefined;
  const usageId = searchParams.get("usageId");
  const tweetId = searchParams.get("tweetId");
  const topicId = searchParams.get("topicId");
  const limitRaw = Number(searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 20;

  return NextResponse.json(
    {
      drafts: listGeneratedDrafts({
        kind,
        usageId,
        tweetId,
        topicId,
        limit
      })
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
